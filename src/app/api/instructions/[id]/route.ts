import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfWeek } from "date-fns";
import { detachInstructionFromMediumOrder, syncInstructionMediumOrder } from "@/lib/instruction-medium-order";
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

// Sửa chỉ định cấy TRƯỚC khi Kho mô bàn giao (handedOverAt còn null) — chỉ cho đổi số liệu của các
// dòng quy cách ĐÃ CÓ (số lượng dùng/tỉ lệ/môi trường) + Tuần thực hiện/Ghi chú, KHÔNG cho thêm/bớt
// dòng hay đổi giàn kệ nguồn (giữ nguyên lotId đã "cấy chuyển" từ lúc tạo — đổi giàn kệ sẽ phải động
// tới trạng thái PLANTED của lô nguồn, phức tạp và rủi ro hơn nhiều so với lợi ích, xem comment ở PATCH
// bên dưới). Cùng cấu trúc dòng với create-instruction-dialog.tsx.
const editItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
  motherSampleRatio: z.number().positive().nullable(),
  rootingRatio: z.number().positive().nullable(),
  motherMediumTypeId: z.string().min(1).nullable(),
  finishedMediumTypeId: z.string().min(1).nullable(),
});

const patchSchema = z.union([
  z.object({ status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED", "ENDED"]) }),
  z.object({ assignedToId: z.string().min(1) }),
  z.object({ confirmHandover: z.literal(true) }),
  z.object({ confirmMotherReceived: z.literal(true) }),
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
    }
    const updated = await prisma.plantingInstruction.update({
      where: { id },
      data: { motherReceivedAt: instruction.motherReceivedAt ?? new Date() },
    });
    return NextResponse.json(updated);
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
