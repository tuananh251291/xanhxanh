import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateInstructionCode } from "@/lib/codes";
import { syncInstructionMediumOrder } from "@/lib/instruction-medium-order";
import { isAdminRole } from "@/types";
import { z } from "zod";
import { startOfWeek } from "date-fns";

// Mỗi dòng = 1 quy cách nguồn (M05 — quy cách mẫu mẹ duy nhất) được dùng, lấy từ 1 lô cụ thể trên 1 kệ.
// Mỗi dòng tự có tỉ lệ + môi trường riêng — output KHÔNG dây chuyền qua nhau: dự kiến mẫu mẹ = quantity
// × motherSampleRatio, dự kiến thành phẩm = quantity × rootingRatio (độc lập). Môi trường cũng tách
// riêng: 1 để nhân mẫu mẹ, 1 để ra rễ thành cây thành phẩm.
const shelfItemSchema = z.object({
  shelfId: z.string(),
  lotId: z.string(),
  stageCode: z.enum(["M05"]),
  quantity: z.number().int().positive(),
  // Cho phép để trống (null) — KY_THUAT có thể chưa biết tỉ lệ thực tế lúc tạo chỉ định, xác nhận qua
  // dialog cảnh báo ở client (create-instruction-dialog.tsx) trước khi gửi lên. Để trống thì không tính
  // được expectedMotherOutput/expectedFinishedOutput cho dòng đó (giữ null, không phải 0 — 0 sẽ hiểu
  // nhầm thành "dự kiến ra 0", trong khi thực chất là "chưa có dự kiến").
  motherSampleRatio: z.number().positive().nullable(),
  rootingRatio: z.number().positive().nullable(),
  // Chỉ bắt buộc chọn khi tỉ lệ tương ứng có nhập (chặn ở client) — null nếu tỉ lệ đó để trống, vì
  // không dùng tới (xem buildInstructionMediumNeeds ở src/lib/medium-orders.ts).
  motherMediumTypeId: z.string().min(1).nullable(),
  finishedMediumTypeId: z.string().min(1).nullable(),
});

const createSchema = z.object({
  plantTypeId: z.string(),
  // Bắt buộc — để trống khiến chỉ định không bao giờ tự kết thúc được (ensureInstructionsEnded lọc
  // theo weekStart, bỏ qua bản ghi null) và NV cấy mô không nhập được nhật ký ngày (POST
  // /api/daily-records chặn cứng nếu thiếu weekStart).
  weekStart: z.string().min(1, "Cần chọn Tuần thực hiện"),
  notes: z.string().optional(),
  shelfItems: z.array(shelfItemSchema).min(1, "Cần chọn ít nhất 1 dòng quy cách nguồn"),
  // Kế hoạch phân bổ thành phẩm dự kiến theo quy cách đóng gói (T01/T05) — chỉ để đối chiếu sau này,
  // lô thành phẩm thật sự tạo ra khi NV cấy nhập nhật ký sẽ tự chọn quy cách theo thực tế.
  plannedT01Quantity: z.number().int().min(0).default(0),
  plannedT05Quantity: z.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const role = session.user.role;
  const userId = session.user.id;

  const where: Record<string, unknown> = {};
  if (role === "CAY_MO") where.assignedToId = userId;
  if (role === "KY_THUAT") where.createdById = userId;

  const status = searchParams.get("status");
  if (status) where.status = status;

  const instructions = await prisma.plantingInstruction.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      items: {
        include: {
          shelf: { select: { code: true, name: true } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
        },
      },
      _count: { select: { dailyRecords: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(instructions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role) && session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { shelfItems, plantTypeId, weekStart, notes, plannedT01Quantity, plannedT05Quantity } = parsed.data;

  // Không cho tạo chỉ định cho tuần đã trôi qua — so theo tuần chứa weekStart (weekStartsOn: 1), không
  // bắt buộc weekStart phải đúng ngày Thứ 2. Chặn cả ở đây phòng khi client gửi thẳng lên (bỏ qua input
  // date có min ở create-instruction-dialog.tsx).
  if (startOfWeek(new Date(weekStart), { weekStartsOn: 1 }) < startOfWeek(new Date(), { weekStartsOn: 1 })) {
    return NextResponse.json({ message: "Không được chọn tuần đã trôi qua" }, { status: 400 });
  }

  // Chỉ định cấy chỉ được lấy nguồn từ kệ trong Phòng mẫu mẹ của Kho sản xuất — chặn ở server phòng khi
  // client gửi thẳng lên (bỏ qua dropdown đã lọc sẵn ở UI).
  const shelfIds = Array.from(new Set(shelfItems.map((item) => item.shelfId)));
  const validShelves = await prisma.shelf.findMany({
    where: { id: { in: shelfIds }, room: { type: "PHONG_MAU_ME", warehouse: { type: "SAN_XUAT" } } },
    select: { id: true, code: true, assignedStaffId: true, warehouse: { select: { code: true } } },
  });
  if (validShelves.length !== shelfIds.length) {
    return NextResponse.json({ message: "Chỉ được chọn kệ trong Phòng mẫu mẹ của Kho sản xuất" }, { status: 400 });
  }

  // Kệ Phòng mẫu mẹ "đã chia" (gắn sẵn 1 NV cấy mô cụ thể) → tự động gán luôn NV đó cho chỉ định,
  // Kho mô không cần chọn tay. Kệ "chung" (chưa gắn NV) → để trống, Kho mô tự chọn sau (AssignStaffCell).
  const distinctStaffIds = new Set(validShelves.map((s) => s.assignedStaffId).filter((id): id is string => !!id));
  const autoAssignedToId = distinctStaffIds.size === 1 && validShelves.every((s) => s.assignedStaffId)
    ? [...distinctStaffIds][0]
    : undefined;

  // Lưu ý: KHO_MO/KY_THUAT vẫn được tạo và gán/bàn giao chỉ định mới cho NV cấy mô ngay cả khi NV đó
  // đang thực hiện 1 chỉ định khác (VD: chuẩn bị trước chỉ định tuần sau) — chỉ định mới sẽ ở trạng thái
  // "Chưa bàn giao"/"Đã bàn giao / chờ xác nhận" cho tới khi NV cấy mô xác nhận. Luật "1 chỉ định tại 1
  // thời điểm" chỉ chặn ở bước NV cấy mô XÁC NHẬN nhận mẫu mẹ (xem confirmMotherReceived trong
  // /api/instructions/[id]/route.ts), không chặn ở bước tạo/gán/bàn giao.

  const itemsWithOutput = shelfItems.map((item) => ({
    ...item,
    expectedMotherOutput: item.motherSampleRatio != null ? Math.floor(item.quantity * item.motherSampleRatio) : null,
    expectedFinishedOutput: item.rootingRatio != null ? Math.floor(item.quantity * item.rootingRatio) : null,
  }));

  const inputMotherQuantity = itemsWithOutput.reduce((sum, item) => sum + item.quantity, 0);
  const expectedMotherOutput = itemsWithOutput.reduce((sum, item) => sum + (item.expectedMotherOutput ?? 0), 0);
  const expectedFinishedOutput = itemsWithOutput.reduce((sum, item) => sum + (item.expectedFinishedOutput ?? 0), 0);

  // Mã chỉ định gắn với giàn kệ nguồn — cả nhóm shelfItems chỉ chọn từ 1 kệ duy nhất theo quy trình
  // tạo chỉ định hiện tại, nên lấy kệ đầu tiên làm căn cứ sinh mã.
  const code = await generateInstructionCode({
    warehouseCode: validShelves[0].warehouse.code,
    shelfCode: validShelves[0].code,
  });

  // Mỗi lô mẫu mẹ nguồn (shelfItems[].lotId) được trích dẫn ở đây coi như "đã lên kế hoạch cấy chuyển"
  // — nhưng CHƯA trừ tồn kệ (status vẫn ACTIVE) ngay lúc tạo chỉ định, vì Kho mô chưa thật sự bàn giao
  // mẫu mẹ, hàng vẫn nằm nguyên trên kệ. Status chỉ chuyển sang PLANTED (trừ khỏi tồn kệ) đúng lúc Kho
  // mô bấm "Bàn giao" — xem PATCH /api/instructions/[id] (nhánh confirmHandover và nhánh gán NV cho kệ
  // "chung", cả 2 đều là hành động bàn giao thật). Kệ vẫn biến mất khỏi "Kệ sắp đến hạn cấy chuyển" ngay
  // từ lúc TẠO chỉ định (không cần đợi bàn giao) — nhờ điều kiện instructionItems:{none:{}} ở
  // summarizeMotherWeekGroups (src/lib/mother-week-group.ts), độc lập với Lot.status.
  const instruction = await prisma.$transaction(async (tx) => {
    const created = await tx.plantingInstruction.create({
      data: {
        code,
        plantType: { connect: { id: plantTypeId } },
        createdBy: { connect: { id: session!.user.id } },
        assignedTo: autoAssignedToId ? { connect: { id: autoAssignedToId } } : undefined,
        notes,
        inputMotherQuantity,
        expectedMotherOutput,
        expectedFinishedOutput,
        plannedT01Quantity,
        plannedT05Quantity,
        weekStart: weekStart ? new Date(weekStart) : undefined,
        status: "ACTIVE",
        items: {
          create: itemsWithOutput.map((item) => ({
            shelfId: item.shelfId,
            lotId: item.lotId,
            stageCode: item.stageCode,
            quantity: item.quantity,
            motherSampleRatio: item.motherSampleRatio,
            rootingRatio: item.rootingRatio,
            expectedMotherOutput: item.expectedMotherOutput,
            expectedFinishedOutput: item.expectedFinishedOutput,
            motherMediumTypeId: item.motherMediumTypeId,
            finishedMediumTypeId: item.finishedMediumTypeId,
          })),
        },
      },
      include: {
        plantType: true,
        assignedTo: { select: { name: true } },
        items: { include: { shelf: true, lot: true, motherMedium: true, finishedMedium: true } },
      },
    });

    return created;
  });

  // Tự động sinh/gộp đơn đặt hàng môi trường cho NV môi trường ngay khi chỉ định được tạo. Nhiều chỉ
  // định cùng tuần thực hiện (weekStart) — KY_THUAT thường ra nhiều chỉ định trước Thứ 5 tuần này, tất
  // cả dùng cho tuần sau — gộp chung vào 1 đơn, cộng dồn số lượng theo từng quy cách (xem
  // lib/medium-orders.ts). Chỉ gộp vào đơn CHƯA xác nhận; nếu đơn của tuần đó đã được MOI_TRUONG xác
  // nhận rồi, chỉ định muộn sẽ mở 1 đơn mới riêng thay vì âm thầm đổi số liệu đơn đang thực hiện. Logic
  // dùng chung với PATCH .../edit (chỉnh sửa chỉ định trước khi bàn giao) — xem instruction-medium-order.ts.
  await syncInstructionMediumOrder(instruction, instruction.items, plannedT01Quantity, plannedT05Quantity);

  return NextResponse.json(instruction, { status: 201 });
}
