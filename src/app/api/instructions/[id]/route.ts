import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfWeek } from "date-fns";
import { detachInstructionFromMediumOrder, syncInstructionMediumOrder } from "@/lib/instruction-medium-order";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { z } from "zod";

// Mẫu mẹ nguồn (shelfItems[].lotId lúc tạo) CHỈ thật sự trừ khỏi tồn kệ (status ACTIVE -> PLANTED) đúng
// lúc Kho mô bàn giao — KHÔNG còn trừ ngay lúc KY_THUAT tạo chỉ định nữa (xem POST /api/instructions).
// Trước bàn giao, mẫu mẹ vẫn nằm nguyên trên kệ nên tồn kệ vẫn hiển thị đủ; kệ vẫn biến mất khỏi "Kệ sắp
// đến hạn cấy chuyển" ngay từ lúc tạo nhờ điều kiện instructionItems:{none:{}} ở summarizeMotherWeekGroups
// (độc lập với Lot.status). Gọi hàm này ở CẢ 2 nhánh "bàn giao" bên dưới (confirmHandover và gán NV cho
// kệ "chung" — nhánh sau cũng là 1 hình thức bàn giao, xem comment tại đó). Chỉ đổi Lot.status — KHÔNG
// đụng tới Shelf.assignedStaffId/plantTypeId, vì "đã chia"/"chung" là cấu hình cố định của kệ, không
// phụ thuộc tồn kho hiện có (kệ vẫn thuộc nhóm "đã chia" dù tồn về 0 sau bàn giao).
async function markSourceLotsPlanted(tx: Prisma.TransactionClient, items: { lotId: string | null }[]): Promise<void> {
  const sourceLotIds = Array.from(new Set(items.map((i) => i.lotId).filter((v): v is string => !!v)));
  if (sourceLotIds.length === 0) return;
  await tx.lot.updateMany({ where: { id: { in: sourceLotIds } }, data: { status: "PLANTED" } });
}

// Ngược lại markSourceLotsPlanted — dùng khi Kho mô "Hoàn tác" bàn giao (xem nhánh undoHandover bên
// dưới). Chỉ trả về ACTIVE đúng những lô ĐANG là PLANTED — phòng trường hợp hiếm lô đã bị đổi status vì
// lý do khác (VD nhiễm) giữa lúc bàn giao và lúc hoàn tác, tránh ghi đè nhầm trạng thái đó.
async function revertSourceLotsToActive(tx: Prisma.TransactionClient, items: { lotId: string | null }[]): Promise<void> {
  const sourceLotIds = Array.from(new Set(items.map((i) => i.lotId).filter((v): v is string => !!v)));
  if (sourceLotIds.length === 0) return;
  await tx.lot.updateMany({ where: { id: { in: sourceLotIds }, status: "PLANTED" }, data: { status: "ACTIVE" } });
}

// Sửa chỉ định cấy TRƯỚC khi Kho mô bàn giao (handedOverAt còn null) — chỉ cho đổi số liệu của các
// dòng quy cách ĐÃ CÓ (số lượng dùng/tỉ lệ/môi trường) + Tuần thực hiện/Ghi chú, KHÔNG cho thêm/bớt
// dòng hay đổi giàn kệ nguồn (giữ nguyên lotId đã "cấy chuyển" từ lúc tạo — đổi giàn kệ sẽ phải động
// tới trạng thái PLANTED của lô nguồn, phức tạp và rủi ro hơn nhiều so với lợi ích, xem comment ở PATCH
// bên dưới). Cùng cấu trúc dòng với create-instruction-dialog.tsx.
const editItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
  motherSampleRatio: z.number().positive().nullable(),
  // Cho phép 0 (khác null) — 0 nghĩa là chủ động xác nhận chỉ định không ra thành phẩm, null vẫn là
  // chưa xác định tỉ lệ (xem comment ở api/instructions/route.ts).
  rootingRatio: z.number().nonnegative().nullable(),
  motherMediumTypeId: z.string().min(1).nullable(),
  finishedMediumTypeId: z.string().min(1).nullable(),
});

const patchSchema = z.union([
  z.object({ status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED", "ENDED"]) }),
  z.object({ assignedToId: z.string().min(1) }),
  z.object({ assignExtraWorkRequestId: z.string().min(1) }),
  z.object({ confirmHandover: z.literal(true) }),
  z.object({ undoHandover: z.literal(true) }),
  z.object({ confirmMotherReceived: z.literal(true) }),
  z.object({ endEarly: z.literal(true) }),
  z.object({ cancelInstruction: z.literal(true) }),
  z.object({
    edit: z.object({
      weekStart: z.string().min(1, "Cần chọn Tuần thực hiện"),
      notes: z.string().optional(),
      items: z.array(editItemSchema).min(1),
      plannedT01Quantity: z.number().int().min(0).default(0),
      plannedT05Quantity: z.number().int().min(0).default(0),
    }),
  }),
  // Trang "Sửa SL chỉ định cấy" (gõ mã, sửa riêng số lượng dùng) — dành cho Admin cấp cao (SUPER_ADMIN,
  // sửa được cả khi đã bàn giao, miễn chỉ định còn đang thực hiện) và Kho mô (chỉ sửa được TRƯỚC khi NV
  // cấy mô xác nhận nhận mẫu mẹ — sau đó coi như đã chốt, NV có thể đã bắt đầu dùng theo số liệu cũ).
  // Khác nhánh "edit" ở trên: KHÔNG đổi tỉ lệ/môi trường/tuần — chỉ đổi quantity, giữ nguyên
  // motherSampleRatio/rootingRatio đã lưu để tính lại expectedMotherOutput/expectedFinishedOutput.
  z.object({
    editQuantities: z.object({
      items: z.array(z.object({ itemId: z.string(), quantity: z.number().int().positive() })).min(1),
    }),
  }),
]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id },
    include: {
      plantType: true,
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      items: {
        include: {
          shelf: { include: { warehouse: true } },
          // quantity của lot = trần cho phép sửa "Số lượng dùng" khi chỉnh sửa chỉ định (edit) — chỉ
          // hiển thị/kiểm tra, không đụng tới field này khi sửa (xem PATCH .../edit bên dưới).
          lot: { select: { code: true, quantity: true } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
        },
      },
      dailyRecords: {
        include: {
          staff: { select: { name: true } },
          items: { include: { lot: { select: { code: true, stage: true, quantity: true } } } },
        },
        orderBy: { recordDate: "desc" },
      },
      lots: { where: { status: "ACTIVE" }, include: { shelf: true } },
      mediumOrder: { select: { id: true, code: true, confirmedAt: true } },
    },
  });
  if (!instruction) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(instruction);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id } = await params;
  const role = session?.user?.role;

  if ("confirmMotherReceived" in parsed.data) {
    const instruction = await prisma.plantingInstruction.findUnique({ where: { id } });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (instruction.assignedToId !== session?.user?.id) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    // Chỉ định đã bị hệ thống tự kết thúc (VD hết thời gian, xem ensureInstructionsEnded) hoặc bị
    // hủy/hoàn thành thì không còn gì để xác nhận — tránh trạng thái mâu thuẫn "đã kết thúc" nhưng
    // "vừa mới nhận mẫu mẹ".
    if (instruction.status !== "ACTIVE" && instruction.status !== "DRAFT") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc hoặc đã hủy — không thể xác nhận nhận mẫu mẹ" }, { status: 400 });
    }
    // Chỉ định cho tuần nào thì chỉ được xác nhận nhận mẫu mẹ TỪ ĐÚNG THỨ 2 của tuần đó trở đi — KHO_MO
    // có thể bàn giao trước (VD chỉ định dự phòng tạo/bàn giao giữa tuần cho tuần sau), nhưng NV không
    // được xác nhận sớm hơn ngày bắt đầu thực hiện thật. weekStart lưu UTC-midnight của đúng Thứ 2 đó
    // (xem toStoredWeekStart/week-rotation.ts) nên so trực tiếp với "now" là đủ, không cần quy đổi giờ.
    if (instruction.weekStart && new Date() < instruction.weekStart) {
      return NextResponse.json(
        {
          message: `Chỉ định cho tuần bắt đầu ${instruction.weekStart.toLocaleDateString("vi-VN")} — chưa tới ngày bắt đầu thực hiện, chưa thể xác nhận nhận mẫu mẹ`,
        },
        { status: 400 }
      );
    }
    // NV cấy mô chỉ được thực hiện 1 chỉ định tại 1 thời điểm — KHO_MO có thể bàn giao trước chỉ định
    // mới bất cứ lúc nào, nhưng NV cấy mô chỉ được XÁC NHẬN (bắt đầu) sau khi chỉ định đang thực hiện
    // hiện tại (đã xác nhận nhận mẫu mẹ nhưng chưa kết thúc) thực sự kết thúc.
    if (!instruction.motherReceivedAt) {
      const stillActive = await prisma.plantingInstruction.findFirst({
        where: {
          assignedToId: instruction.assignedToId,
          motherReceivedAt: { not: null },
          status: { in: ["ACTIVE", "DRAFT"] },
          id: { not: id },
        },
        select: { code: true },
      });
      if (stillActive) {
        return NextResponse.json(
          { message: `Bạn còn chỉ định ${stillActive.code} đang thực hiện chưa kết thúc — chỉ có thể xác nhận chỉ định mới sau khi chỉ định đó kết thúc` },
          { status: 400 }
        );
      }
      // Không cho xác nhận chỉ định mới nếu còn mẫu mẹ dư của 1 chỉ định TRƯỚC (kết thúc do hết thời
      // gian/tự kết thúc sớm — 2 lý do duy nhất còn có thể dư, xem END_REASON_LABELS ở my-instructions)
      // chưa bàn giao cho Kho mô (surplusHandedOverAt còn null) — hay gặp nhất đúng sáng Thứ 2 đầu tuần,
      // khi chỉ định tuần trước vừa kết thúc Chủ nhật mà NV quên bàn giao MM dư trước khi nhận việc mới.
      const endedWithSurplusCandidates = await prisma.plantingInstruction.findMany({
        where: {
          assignedToId: instruction.assignedToId,
          status: "ENDED",
          endReason: { in: ["TIME_UP", "EARLY_END_BY_STAFF"] },
          surplusHandedOverAt: null,
          id: { not: id },
        },
        select: { code: true, inputMotherQuantity: true, dailyRecords: { select: { motherChecked: true } } },
      });
      const pendingSurplus = endedWithSurplusCandidates.find(
        (e) => e.inputMotherQuantity - e.dailyRecords.reduce((sum, r) => sum + r.motherChecked, 0) > 0
      );
      if (pendingSurplus) {
        return NextResponse.json(
          { message: `Bạn còn mẫu mẹ dư của chỉ định ${pendingSurplus.code} chưa bàn giao cho Kho mô — phải bàn giao MM dư trước khi nhận chỉ định mới` },
          { status: 400 }
        );
      }
      // Ưu tiên xác nhận ĐÚNG THỨ TỰ đã bàn giao — nếu còn chỉ định khác đã bàn giao TRƯỚC chỉ định này
      // mà NV chưa xác nhận, phải xác nhận chỉ định đó trước. Thiếu check này từng khiến NV xác nhận
      // nhầm 1 chỉ định tuần sau trong lúc chỉ định tuần này/dự phòng đã bàn giao sớm hơn vẫn đang chờ —
      // chỉ định đó bị kẹt vĩnh viễn vì "1 NV/1 chỉ định" đã bị chỉ định tuần sau chiếm chỗ.
      if (instruction.handedOverAt) {
        const earlierPending = await prisma.plantingInstruction.findFirst({
          where: {
            assignedToId: instruction.assignedToId,
            handedOverAt: { not: null, lt: instruction.handedOverAt },
            motherReceivedAt: null,
            status: { in: ["ACTIVE", "DRAFT"] },
            id: { not: id },
          },
          select: { code: true },
          orderBy: { handedOverAt: "asc" },
        });
        if (earlierPending) {
          return NextResponse.json(
            { message: `Bạn còn chỉ định ${earlierPending.code} đã bàn giao trước chỉ định này mà chưa xác nhận — phải xác nhận chỉ định đó trước` },
            { status: 400 }
          );
        }
      }
    }
    const updated = await prisma.plantingInstruction.update({
      where: { id },
      data: { motherReceivedAt: instruction.motherReceivedAt ?? new Date() },
    });
    return NextResponse.json(updated);
  }

  // NV cấy mô tự bấm "Kết thúc chỉ định sớm" ở trang Nhập dữ liệu cấy (VD nghỉ đột xuất giữa tuần,
  // không làm nốt các ngày còn lại — hết Thứ 7 mà không đi làm Chủ nhật thì bấm) — thay vì để chỉ định
  // treo "Đang thực hiện" tới tận khi ensureInstructionsEnded tự đóng lúc sang tuần mới. Cùng bản chất
  // "hết thời gian sử dụng" như TIME_UP (chỉ khác lý do: NV chủ động dừng, không phải hết tuần) nên vẫn
  // có thể còn MM dư cần bàn giao — xem endReason EARLY_END_BY_STAFF được cho phép ở
  // POST /api/instructions/[id]/surplus-handover và my-instructions/page.tsx.
  if ("endEarly" in parsed.data) {
    const instruction = await prisma.plantingInstruction.findUnique({ where: { id } });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (instruction.assignedToId !== session?.user?.id) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    if (instruction.status !== "ACTIVE" && instruction.status !== "DRAFT") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc hoặc đã hủy — không thể kết thúc sớm" }, { status: 400 });
    }
    const updated = await prisma.plantingInstruction.update({
      where: { id },
      data: { status: "ENDED", endReason: "EARLY_END_BY_STAFF" },
    });
    return NextResponse.json(updated);
  }

  if ("editQuantities" in parsed.data) {
    const isSuperAdmin = role === "SUPER_ADMIN";
    const isKhoMo = role === "KHO_MO";
    if (!isSuperAdmin && !isKhoMo) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id },
      include: {
        items: { include: { lot: { select: { quantity: true } }, shelf: { select: { warehouseId: true } } } },
      },
    });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

    if (instruction.status !== "DRAFT" && instruction.status !== "ACTIVE") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc hoặc đã hủy — không thể sửa số lượng" }, { status: 400 });
    }
    // Kho mô chỉ được sửa TRƯỚC khi NV cấy mô xác nhận nhận mẫu mẹ, và chỉ đúng kho mình đang làm việc
    // (giống check ở nhánh assignExtraWorkRequestId) — Admin cấp cao không bị 2 ràng buộc này.
    if (isKhoMo) {
      if (instruction.motherReceivedAt) {
        return NextResponse.json({ message: "NV cấy mô đã xác nhận nhận mẫu mẹ — không thể sửa số lượng nữa" }, { status: 400 });
      }
      const instructionWarehouseId = instruction.items[0]?.shelf?.warehouseId;
      if (instructionWarehouseId !== session!.user.workplaceWarehouseId) {
        return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
      }
    }

    const { items: editItems } = parsed.data.editQuantities;
    const currentItemIds = new Set(instruction.items.map((i) => i.id));
    const editItemIds = new Set(editItems.map((i) => i.itemId));
    if (currentItemIds.size !== editItemIds.size || [...currentItemIds].some((itemId) => !editItemIds.has(itemId))) {
      return NextResponse.json({ message: "Không được thêm/bớt dòng quy cách khi sửa số lượng" }, { status: 400 });
    }

    // Chặn vượt tồn lô nguồn CHỈ áp dụng cho Kho mô — họ luôn sửa TRƯỚC bàn giao (chặn ở check
    // motherReceivedAt/ACTIVE phía trên còn chặt hơn), lúc đó Lot.quantity vẫn là tồn thật đang nằm trên
    // kệ nên không thể dùng nhiều hơn số đó. Admin cấp cao được sửa cả SAU bàn giao — lúc đó lô nguồn đã
    // chuyển PLANTED và Lot.quantity chỉ còn là ảnh chụp tồn tại THỜI ĐIỂM bàn giao, không hề bị trừ theo
    // "Số lượng dùng" đã ghi (không có cơ chế nào đồng bộ ngược 2 số này) — sửa vượt số đó không ảnh
    // hưởng gì tới lô nguồn hay bất kỳ tính toán nào khác, chỉ đơn thuần là sửa số liệu ghi nhận.
    const itemsById = new Map(instruction.items.map((i) => [i.id, i]));
    if (!isSuperAdmin) {
      for (const ei of editItems) {
        const current = itemsById.get(ei.itemId)!;
        if (current.lot && ei.quantity > current.lot.quantity) {
          return NextResponse.json(
            { message: `Dòng ${current.stageCode ?? ""}: số lượng dùng không được vượt quá ${current.lot.quantity.toLocaleString("vi-VN")} cụm hiện có trên lô nguồn` },
            { status: 400 }
          );
        }
      }
    }

    const itemsWithOutput = editItems.map((ei) => {
      const current = itemsById.get(ei.itemId)!;
      return {
        itemId: ei.itemId,
        quantity: ei.quantity,
        expectedMotherOutput: current.motherSampleRatio != null ? Math.floor(ei.quantity * current.motherSampleRatio) : null,
        expectedFinishedOutput: current.rootingRatio != null ? Math.floor(ei.quantity * current.rootingRatio) : null,
      };
    });
    const inputMotherQuantity = itemsWithOutput.reduce((sum, i) => sum + i.quantity, 0);
    const expectedMotherOutput = itemsWithOutput.reduce((sum, i) => sum + (i.expectedMotherOutput ?? 0), 0);
    const expectedFinishedOutput = itemsWithOutput.reduce((sum, i) => sum + (i.expectedFinishedOutput ?? 0), 0);

    // Không cho giảm tổng số lượng dùng xuống dưới số cụm NV cấy mô ĐÃ kiểm tra dùng rồi (motherChecked
    // cộng dồn qua các DailyRecord của chỉ định này) — tránh trạng thái "đã dùng nhiều hơn số lượng dùng
    // mới", vốn dùng để tự kết thúc chỉ định (MOTHER_USED_UP, xem POST /api/daily-records).
    const usedSoFar = await prisma.dailyRecord.aggregate({
      where: { instructionId: id },
      _sum: { motherChecked: true },
    });
    const totalChecked = usedSoFar._sum.motherChecked ?? 0;
    if (inputMotherQuantity < totalChecked) {
      return NextResponse.json(
        { message: `Không thể giảm số lượng dùng xuống dưới ${totalChecked.toLocaleString("vi-VN")} cụm — NV cấy mô đã kiểm tra dùng số lượng này rồi` },
        { status: 400 }
      );
    }

    // Đơn đặt hàng môi trường đã được NV môi trường xác nhận thì KHÔNG động vào nữa (họ có thể đã bắt
    // đầu pha chế theo số liệu cũ) — vẫn cho sửa xong chỉ định, chỉ đơn không tự cập nhật theo.
    let mediumOrderLocked = false;
    if (instruction.mediumOrderId) {
      const order = await prisma.mediumOrder.findUnique({ where: { id: instruction.mediumOrderId }, select: { confirmedAt: true } });
      mediumOrderLocked = !!order?.confirmedAt;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const i of itemsWithOutput) {
        await tx.plantingInstructionItem.update({
          where: { id: i.itemId },
          data: { quantity: i.quantity, expectedMotherOutput: i.expectedMotherOutput, expectedFinishedOutput: i.expectedFinishedOutput },
        });
      }
      if (instruction.mediumOrderId && !mediumOrderLocked) {
        await detachInstructionFromMediumOrder(tx, instruction.id, instruction.mediumOrderId);
      }
      return tx.plantingInstruction.update({
        where: { id },
        data: { inputMotherQuantity, expectedMotherOutput, expectedFinishedOutput },
        include: { items: true },
      });
    });

    if (!mediumOrderLocked) {
      await syncInstructionMediumOrder(updated, updated.items, updated.plannedT01Quantity ?? 0, updated.plannedT05Quantity ?? 0);
    }

    return NextResponse.json({ ...updated, mediumOrderLocked });
  }

  if ("edit" in parsed.data) {
    if (!(isAdminRole(role) || role === "KY_THUAT")) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id },
      include: { items: { include: { lot: { select: { quantity: true } } } } },
    });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    // Chỉ sửa được TRƯỚC khi Kho mô bàn giao — bàn giao rồi coi như đã "chốt", NV cấy mô có thể đã bắt
    // đầu dựa theo số liệu cũ.
    if (instruction.handedOverAt) {
      return NextResponse.json({ message: "Chỉ định đã bàn giao — không thể chỉnh sửa nữa" }, { status: 400 });
    }
    if (instruction.status !== "DRAFT" && instruction.status !== "ACTIVE") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc hoặc đã hủy — không thể chỉnh sửa" }, { status: 400 });
    }

    const { weekStart, notes, items: editItems, plannedT01Quantity, plannedT05Quantity } = parsed.data.edit;

    if (startOfWeek(new Date(weekStart), { weekStartsOn: 1 }) < startOfWeek(new Date(), { weekStartsOn: 1 })) {
      return NextResponse.json({ message: "Không được chọn tuần đã trôi qua" }, { status: 400 });
    }

    // Không cho thêm/bớt dòng quy cách — bắt buộc đúng 1-1 với các dòng đang có (xem comment ở
    // editItemSchema phía trên: đổi giàn kệ nguồn đòi hỏi revert/re-plant trạng thái lô, ngoài phạm vi
    // tính năng sửa này).
    const currentItemIds = new Set(instruction.items.map((i) => i.id));
    const editItemIds = new Set(editItems.map((i) => i.itemId));
    if (currentItemIds.size !== editItemIds.size || [...currentItemIds].some((itemId) => !editItemIds.has(itemId))) {
      return NextResponse.json({ message: "Không được thêm/bớt dòng quy cách khi chỉnh sửa" }, { status: 400 });
    }

    const itemsById = new Map(instruction.items.map((i) => [i.id, i]));
    for (const ei of editItems) {
      const current = itemsById.get(ei.itemId)!;
      if (current.lot && ei.quantity > current.lot.quantity) {
        return NextResponse.json(
          { message: `Dòng ${current.stageCode ?? ""}: số lượng dùng không được vượt quá ${current.lot.quantity.toLocaleString("vi-VN")} cụm hiện có trên lô nguồn` },
          { status: 400 }
        );
      }
    }

    const itemsWithOutput = editItems.map((ei) => ({
      ...ei,
      stageCode: itemsById.get(ei.itemId)!.stageCode,
      expectedMotherOutput: ei.motherSampleRatio != null ? Math.floor(ei.quantity * ei.motherSampleRatio) : null,
      expectedFinishedOutput: ei.rootingRatio != null ? Math.floor(ei.quantity * ei.rootingRatio) : null,
    }));
    const inputMotherQuantity = itemsWithOutput.reduce((sum, i) => sum + i.quantity, 0);
    const expectedMotherOutput = itemsWithOutput.reduce((sum, i) => sum + (i.expectedMotherOutput ?? 0), 0);
    const expectedFinishedOutput = itemsWithOutput.reduce((sum, i) => sum + (i.expectedFinishedOutput ?? 0), 0);

    // Đơn đặt hàng môi trường đã được NV môi trường xác nhận thì KHÔNG động vào nữa (họ có thể đã bắt
    // đầu pha chế theo số liệu cũ) — vẫn cho sửa xong chỉ định, chỉ báo lại để KY_THUAT tự liên hệ NV
    // môi trường điều chỉnh thủ công nếu cần.
    let mediumOrderLocked = false;
    if (instruction.mediumOrderId) {
      const order = await prisma.mediumOrder.findUnique({ where: { id: instruction.mediumOrderId }, select: { confirmedAt: true } });
      mediumOrderLocked = !!order?.confirmedAt;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const i of itemsWithOutput) {
        await tx.plantingInstructionItem.update({
          where: { id: i.itemId },
          data: {
            quantity: i.quantity,
            motherSampleRatio: i.motherSampleRatio,
            rootingRatio: i.rootingRatio,
            motherMediumTypeId: i.motherMediumTypeId,
            finishedMediumTypeId: i.finishedMediumTypeId,
            expectedMotherOutput: i.expectedMotherOutput,
            expectedFinishedOutput: i.expectedFinishedOutput,
          },
        });
      }
      if (instruction.mediumOrderId && !mediumOrderLocked) {
        await detachInstructionFromMediumOrder(tx, instruction.id, instruction.mediumOrderId);
      }
      return tx.plantingInstruction.update({
        where: { id },
        data: {
          weekStart: new Date(weekStart),
          notes,
          inputMotherQuantity,
          expectedMotherOutput,
          expectedFinishedOutput,
          plannedT01Quantity,
          plannedT05Quantity,
        },
        include: { items: true },
      });
    });

    if (!mediumOrderLocked) {
      await syncInstructionMediumOrder(updated, updated.items, plannedT01Quantity, plannedT05Quantity);
    }

    return NextResponse.json({ ...updated, mediumOrderLocked });
  }

  // Hủy chỉ định cấy TRƯỚC khi Kho mô bàn giao — cùng điều kiện với "edit" ở trên (handedOverAt còn
  // null). Vì mẫu mẹ nguồn vẫn giữ ACTIVE cho tới đúng lúc bàn giao (xem markSourceLotsPlanted/POST
  // /api/instructions), hủy ở đây KHÔNG cần hoàn trạng thái lô — chưa từng bị trừ. Đây cũng chính là
  // cách "giải phóng" 1 lô đang bị mother-stock-reshelf.ts chặn sắp xếp vì đã "có chủ".
  if ("cancelInstruction" in parsed.data) {
    if (!(isAdminRole(role) || role === "KY_THUAT")) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({ where: { id } });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (instruction.handedOverAt) {
      return NextResponse.json({ message: "Chỉ định đã bàn giao — không thể hủy nữa" }, { status: 400 });
    }
    if (instruction.status === "CANCELLED" || instruction.status === "ENDED" || instruction.status === "COMPLETED") {
      return NextResponse.json({ message: "Chỉ định đã kết thúc — không thể hủy" }, { status: 400 });
    }

    let mediumOrderLocked = false;
    if (instruction.mediumOrderId) {
      const order = await prisma.mediumOrder.findUnique({ where: { id: instruction.mediumOrderId }, select: { confirmedAt: true } });
      mediumOrderLocked = !!order?.confirmedAt;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (instruction.mediumOrderId && !mediumOrderLocked) {
        await detachInstructionFromMediumOrder(tx, instruction.id, instruction.mediumOrderId);
      }
      return tx.plantingInstruction.update({ where: { id }, data: { status: "CANCELLED" } });
    });

    return NextResponse.json({ ...updated, mediumOrderLocked });
  }

  // Kho mô bấm "Bàn giao" khi NV cấy mô đã có sẵn (kệ "đã chia" tự động điền mặc định lúc tạo chỉ
  // định) — chỉ xác nhận thời điểm bàn giao thật, không cần chọn lại NV.
  if ("confirmHandover" in parsed.data) {
    if (!(isAdminRole(role) || role === "KHO_MO")) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id },
      include: { items: { select: { lotId: true } } },
    });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (!instruction.assignedToId) {
      return NextResponse.json({ message: "Chỉ định chưa có nhân viên cấy mô để bàn giao" }, { status: 400 });
    }
    // Kho mô được bàn giao trước chỉ định mới ngay cả khi NV cấy mô đang thực hiện chỉ định khác — luật
    // "1 chỉ định tại 1 thời điểm" chỉ chặn ở bước NV cấy mô XÁC NHẬN (xem confirmMotherReceived).
    const isFirstHandover = !instruction.handedOverAt;
    const updated = await prisma.$transaction(async (tx) => {
      if (isFirstHandover) await markSourceLotsPlanted(tx, instruction.items);
      return tx.plantingInstruction.update({
        where: { id },
        data: {
          handedOverAt: instruction.handedOverAt ?? new Date(),
          handedOverById: instruction.handedOverById ?? session!.user!.id,
          // Bàn giao thật sự nghĩa là chỉ định đã bắt đầu chạy — kích hoạt luôn nếu còn ở DRAFT, tránh kẹt
          // ở DRAFT vĩnh viễn (khiến nút xác nhận nhận mẫu mẹ và luật "1 NV/1 chỉ định ACTIVE" bị sai lệch).
          status: instruction.status === "DRAFT" ? "ACTIVE" : instruction.status,
        },
        include: { assignedTo: { select: { name: true } } },
      });
    });
    return NextResponse.json(updated);
  }

  // Kho mô bấm "Hoàn tác" khi lỡ bàn giao nhầm — chỉ cho phép trong khoảng thời gian NV cấy mô CHƯA
  // XÁC NHẬN nhận mẫu mẹ (motherReceivedAt còn null), vì sau khi xác nhận coi như NV đã thật sự bắt đầu
  // dùng mẫu mẹ, hoàn tác lúc đó sẽ tạo trạng thái mâu thuẫn (đã xác nhận nhận nhưng chỉ định lại "chưa
  // bàn giao"). Trả lô nguồn về ACTIVE (ngược lại markSourceLotsPlanted), xoá mốc bàn giao — KHÔNG đụng
  // tới assignedToId cho chỉ định THƯỜNG (giữ nguyên NV đã gán qua kệ "đã chia" — đổi NV là thao tác
  // khác, không thuộc phạm vi hoàn tác bàn giao). Riêng chỉ định DỰ PHÒNG (isBackup): NV được gán qua 1
  // suất đăng ký làm thêm/hoàn thành sớm cụ thể (xem assignExtraWorkRequestId bên dưới) — hoàn tác coi
  // như huỷ luôn việc gán đó, xoá assignedToId + trả lại suất đăng ký về trạng thái "khả dụng"
  // (fulfilledAt/fulfilledInstructionId = null) để Kho mô chọn được NV khác (hoặc gán lại đúng NV cũ)
  // từ danh sách, thay vì kẹt cứng với đúng 1 người và suất đăng ký bị coi như "đã dùng" oan.
  if ("undoHandover" in parsed.data) {
    if (!(isAdminRole(role) || role === "KHO_MO")) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id },
      include: { items: { select: { lotId: true, shelf: { select: { assignedStaffId: true } } } } },
    });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (!instruction.handedOverAt) {
      return NextResponse.json({ message: "Chỉ định chưa được bàn giao — không có gì để hoàn tác" }, { status: 400 });
    }
    if (instruction.motherReceivedAt) {
      return NextResponse.json({ message: "NV cấy mô đã xác nhận nhận mẫu mẹ — không thể hoàn tác bàn giao nữa" }, { status: 400 });
    }
    // NV được gán qua kệ "đã chia" (kệ tự cố định 1 NV, tự động điền ngay lúc TẠO chỉ định — xem
    // autoAssignedToId ở POST /api/instructions) thì hoàn tác GIỮ NGUYÊN NV đó, vì đây là cấu hình kệ,
    // không phải lựa chọn của Kho mô. Ngược lại — kệ "chung" (Kho mô tự chọn NV lúc bàn giao qua
    // isAssignAction, hoặc chỉ định dự phòng qua assignExtraWorkRequestId) — hoàn tác phải TRẢ VỀ TRỐNG
    // để Kho mô gán lại cho NV khác nếu cần, không kẹt cứng với đúng NV đã chọn nhầm/không còn phù hợp.
    const isFromDedicatedShelf =
      !!instruction.assignedToId &&
      instruction.items.length > 0 &&
      instruction.items.every((i) => i.shelf?.assignedStaffId === instruction.assignedToId);
    const updated = await prisma.$transaction(async (tx) => {
      await revertSourceLotsToActive(tx, instruction.items);
      if (instruction.isBackup) {
        await tx.extraWorkRequest.updateMany({
          where: { fulfilledInstructionId: id },
          data: { fulfilledAt: null, fulfilledInstructionId: null },
        });
      }
      return tx.plantingInstruction.update({
        where: { id },
        data: {
          handedOverAt: null,
          handedOverById: null,
          assignedToId: isFromDedicatedShelf ? undefined : null,
        },
        include: { assignedTo: { select: { name: true } } },
      });
    });
    return NextResponse.json(updated);
  }

  // Kho mô bàn giao chỉ định cấy DỰ PHÒNG (isBackup) — thay vì chọn tự do như kệ "chung" thường
  // (isAssignAction bên dưới), phải chọn đúng 1 đăng ký làm thêm/hoàn thành sớm ĐÃ DUYỆT và CHƯA dùng
  // (xem GET /api/extra-work-requests?availableToAssign=true) — hành động này vừa gán NV + bàn giao
  // (giống hệt isAssignAction) VỪA đánh dấu đăng ký đó đã dùng (fulfilledAt) để không bị gán trùng.
  if ("assignExtraWorkRequestId" in parsed.data) {
    if (!(isAdminRole(role) || role === "KHO_MO")) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id },
      include: { items: { select: { lotId: true, shelf: { select: { warehouseId: true } } } } },
    });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (!instruction.isBackup) {
      return NextResponse.json({ message: "Chỉ áp dụng cho chỉ định cấy dự phòng" }, { status: 400 });
    }
    if (instruction.assignedToId) {
      return NextResponse.json({ message: "Chỉ định đã có nhân viên cấy mô" }, { status: 400 });
    }
    // NV cấy mô chỉ được nhận nhiệm vụ từ Kho mô ĐÚNG khu sản xuất (kho) mình đang làm việc — kệ nguồn
    // của chỉ định thuộc kho nào thì chỉ Kho mô của kho đó (và NV đăng ký làm thêm cũng thuộc kho đó,
    // xem check staff.workplaceWarehouseId bên dưới) mới được bàn giao. Thiếu check này thì Kho mô 1 kho
    // vẫn có thể (qua URL/id) bàn giao nhầm chỉ định của kho KHÁC.
    const instructionWarehouseId = instruction.items[0]?.shelf?.warehouseId;
    if (role === "KHO_MO" && instructionWarehouseId !== session!.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ định không thuộc kho bạn làm việc" }, { status: 403 });
    }

    const extraWorkRequest = await prisma.extraWorkRequest.findUnique({
      where: { id: parsed.data.assignExtraWorkRequestId },
      include: { staff: { select: { id: true, workplaceWarehouseId: true } } },
    });
    if (!extraWorkRequest) return NextResponse.json({ message: "Không tìm thấy đăng ký" }, { status: 404 });
    if (extraWorkRequest.staff.workplaceWarehouseId !== instructionWarehouseId) {
      return NextResponse.json({ message: "Đăng ký không thuộc kho của chỉ định này" }, { status: 403 });
    }
    if (role === "KHO_MO" && extraWorkRequest.staff.workplaceWarehouseId !== session!.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Đăng ký không thuộc kho bạn làm việc" }, { status: 403 });
    }
    if (extraWorkRequest.status !== "APPROVED" || extraWorkRequest.fulfilledAt) {
      return NextResponse.json({ message: "Đăng ký này chưa được duyệt hoặc đã dùng cho chỉ định khác" }, { status: 400 });
    }

    const isFirstHandover = !instruction.handedOverAt;
    // Chỉ định dự phòng được TẠO trước (chọn tuần hiện tại hoặc tuần sau chỉ để tổ chức nguồn mẫu mẹ,
    // xem POST /api/instructions) nhưng "Tuần thực hiện" THẬT SỰ phải theo đúng lúc Kho mô bàn giao cho 1
    // NV cụ thể — VD tạo sẵn cho tuần sau nhưng NV hoàn thành sớm chỉ định đang làm nên được bàn giao
    // ngay trong tuần này, thì chỉ định dự phòng đó phải tính là việc của TUẦN NÀY (NV cần nhập dữ liệu
    // ngay hôm nay), không giữ nguyên tuần đã chọn lúc tạo — nếu không "Nhập dữ liệu cấy" sẽ không hiện
    // chỉ định vừa nhận cho tới khi sang đúng tuần đã chọn lúc tạo.
    const weekStartAtHandover = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const updated = await prisma.$transaction(async (tx) => {
      if (isFirstHandover) await markSourceLotsPlanted(tx, instruction.items);
      await tx.extraWorkRequest.update({
        where: { id: extraWorkRequest.id },
        data: { fulfilledAt: new Date(), fulfilledInstructionId: id },
      });
      return tx.plantingInstruction.update({
        where: { id },
        data: {
          assignedToId: extraWorkRequest.staff.id,
          handedOverAt: instruction.handedOverAt ?? new Date(),
          handedOverById: instruction.handedOverById ?? session!.user!.id,
          weekStart: weekStartAtHandover,
        },
        include: { assignedTo: { select: { name: true } } },
      });
    });
    return NextResponse.json(updated);
  }

  const isAssignAction = "assignedToId" in parsed.data;
  const allowed = isAssignAction
    ? isAdminRole(role) || role === "KHO_MO"
    : isAdminRole(role) || role === "KY_THUAT";
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (isAssignAction) {
    // Kho mô được gán/bàn giao trước chỉ định mới (kệ "chung") ngay cả khi NV cấy mô đang thực hiện chỉ
    // định khác — luật "1 chỉ định tại 1 thời điểm" chỉ chặn ở bước NV cấy mô XÁC NHẬN
    // (confirmMotherReceived). Kho mô chọn NV cấy mô (kệ "chung") = hành động bàn giao luôn, đánh dấu cả
    // 2 mốc cùng lúc — nên cũng là lúc trừ tồn kệ (PLANTED) như nhánh confirmHandover ở trên.
    const instruction = await prisma.plantingInstruction.findUnique({
      where: { id },
      include: { items: { select: { lotId: true } } },
    });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    const isFirstHandover = !instruction.handedOverAt;
    const updated = await prisma.$transaction(async (tx) => {
      if (isFirstHandover) await markSourceLotsPlanted(tx, instruction.items);
      return tx.plantingInstruction.update({
        where: { id },
        data: {
          ...parsed.data,
          handedOverAt: instruction.handedOverAt ?? new Date(),
          handedOverById: instruction.handedOverById ?? session!.user!.id,
        },
        include: { assignedTo: { select: { name: true } } },
      });
    });
    return NextResponse.json(updated);
  }

  const updated = await prisma.plantingInstruction.update({
    where: { id },
    data: parsed.data,
    include: { assignedTo: { select: { name: true } } },
  });
  return NextResponse.json(updated);
}
