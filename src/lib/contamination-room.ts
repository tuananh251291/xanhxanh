import { prisma } from "@/lib/prisma";
import type { Prisma, PlantStage, ContaminationEntryReason, ContaminationBalanceCategory } from "@prisma/client";

// Nguồn gốc số nhiễm (xem ContaminationBalanceCategory) suy trực tiếp từ lý do ghi nhận — DANG_THUC_HIEN
// chỉ xảy ra thực tế với M05 (DAILY_RECORD/DAILY_RECORD_EDIT/EXCEL_IMPORT luôn là M05), các lý do còn lại
// đều gắn với 1 lô cụ thể đã có ngày nhập/bàn giao thật nên tính LO_BAN_GIAO.
const BALANCE_CATEGORY_BY_REASON: Record<ContaminationEntryReason, ContaminationBalanceCategory> = {
  DAILY_RECORD: "DANG_THUC_HIEN",
  DAILY_RECORD_EDIT: "DANG_THUC_HIEN",
  EXCEL_IMPORT: "DANG_THUC_HIEN",
  DARK_ROOM_SELF_CHECK: "LO_BAN_GIAO",
  DARK_ROOM_SELF_CHECK_UNDONE: "LO_BAN_GIAO",
  RED_LANE_INSPECTION: "LO_BAN_GIAO",
  PROPOSAL_REJECTED_REFUND: "LO_BAN_GIAO",
};

// Phòng nhiễm — 1 phòng/kho sản xuất, đã seed sẵn (xem prisma/seed.ts, code "{warehouseCode}-NHIEM").
// Chỉ tạo mới ở đây cho trường hợp kho được tạo sau khi seed và chưa có phòng này.
export async function getOrCreateContaminationRoom(warehouseId: string) {
  const existing = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
  if (existing) return existing;

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
  const code = `${warehouse?.code ?? warehouseId.slice(0, 6)}-NHIEM`;

  return prisma.room.create({
    data: { code, name: "Phòng nhiễm", type: "PHONG_NHIEM", warehouseId },
  });
}

// Ghi 1 dòng lịch sử vào ContaminationRoomEntry — dùng chung cho addToContaminationRoom (cộng mới) LẪN
// nơi tự tính tay việc tăng/giảm Phòng nhiễm (xem PATCH /api/daily-records/[id], vẫn giữ logic merge lô
// riêng vì có thêm bước chặn "không đủ để trừ lại", chỉ gọi hàm này để log). quantity có thể ÂM (điều
// chỉnh giảm) — bỏ qua nếu bằng 0 (không có gì để ghi).
export async function logContaminationRoomEntry(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    contaminationLotId: string;
    quantity: number;
    sourceLotId?: string | null;
    sourceLotCode?: string | null;
    reportedById: string;
    reason: ContaminationEntryReason;
  },
) {
  if (params.quantity === 0) return;
  await client.contaminationRoomEntry.create({
    data: {
      contaminationLotId: params.contaminationLotId,
      quantity: params.quantity,
      sourceLotId: params.sourceLotId ?? null,
      sourceLotCode: params.sourceLotCode ?? null,
      reportedById: params.reportedById,
      reason: params.reason,
    },
  });
}

// Cộng/trừ số dư "chờ xử lý" của 1 NV cấy mô (hoặc "" = tồn cũ/không rõ NV) tại (kho, mã cây, quy cách,
// nguồn gốc) — gọi mỗi khi Phòng nhiễm tăng/giảm để giữ đúng bất biến: tổng theo (kho, mã cây, quy cách)
// của bảng này (cộng cả 2 category) luôn khớp Lot.quantity hiện tại của Phòng nhiễm tương ứng (xem
// ContaminationStaffBalance). quantity có thể ÂM; bỏ qua nếu bằng 0.
export async function creditContaminationStaffBalance(
  client: Prisma.TransactionClient | typeof prisma,
  params: { warehouseId: string; staffId: string | null; plantTypeId: string; stageCode: string; category: ContaminationBalanceCategory; quantity: number },
) {
  if (params.quantity === 0) return;
  const staffId = params.staffId ?? "";
  await client.contaminationStaffBalance.upsert({
    where: {
      warehouseId_staffId_plantTypeId_stageCode_category: {
        warehouseId: params.warehouseId, staffId, plantTypeId: params.plantTypeId, stageCode: params.stageCode, category: params.category,
      },
    },
    create: { warehouseId: params.warehouseId, staffId, plantTypeId: params.plantTypeId, stageCode: params.stageCode, category: params.category, quantity: params.quantity },
    update: { quantity: { increment: params.quantity } },
  });
}

// Cộng dồn số lượng nhiễm vào Phòng nhiễm của đúng kho, gộp theo (mã sản phẩm, quy cách) — không phân
// biệt lô/NV cấy mô nào báo (xem Lot.code = "NHIEM-{maKho}-{maCay}"). Mã lô gộp nhúng cả mã kho lẫn mã
// cây vì Lot chỉ unique theo (code, stageCode) trên TOÀN bảng (không scope theo kho), nên phải tự tách
// để 2 kho sản xuất không đụng mã. Mỗi lần gọi cũng ghi 1 dòng ContaminationRoomEntry (xem
// logContaminationRoomEntry) để truy vết được TỪNG LẦN báo nhiễm cụ thể, dù Lot chỉ lưu số gộp.
export async function addToContaminationRoom(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    warehouseId: string;
    warehouseCode: string;
    plantTypeId: string;
    plantTypeCode: string;
    stage: PlantStage;
    stageCode: string;
    quantity: number;
    reportedById: string;
    reason: ContaminationEntryReason;
    sourceLotId?: string | null;
    sourceLotCode?: string | null;
    // NV cấy mô "chủ" của số nhiễm này (cộng vào ContaminationStaffBalance) — KHÔNG mặc định lấy theo
    // reportedById vì có luồng reportedById là người phát hiện/xử lý chứ không phải NV cấy mô gốc (vd
    // Kho mô kiểm tra luồng Đỏ, Admin hoàn lại đề xuất bị từ chối) — bắt buộc truyền tường minh ở mỗi nơi
    // gọi. null = không rõ NV cụ thể (xem creditContaminationStaffBalance).
    staffBalanceOwnerId: string | null;
  },
) {
  if (params.quantity <= 0) return;

  const room = await getOrCreateContaminationRoom(params.warehouseId);
  const code = `NHIEM-${params.warehouseCode}-${params.plantTypeCode}`;

  const existingLot = await client.lot.findFirst({
    where: { roomId: room.id, code, stageCode: params.stageCode },
  });

  let contaminationLotId: string;
  if (existingLot) {
    await client.lot.update({
      where: { id: existingLot.id },
      data: { quantity: { increment: params.quantity }, initialQuantity: { increment: params.quantity } },
    });
    contaminationLotId = existingLot.id;
  } else {
    const created = await client.lot.create({
      data: {
        code,
        plantTypeId: params.plantTypeId,
        stage: params.stage,
        stageCode: params.stageCode,
        roomId: room.id,
        quantity: params.quantity,
        initialQuantity: params.quantity,
        status: "ACTIVE",
      },
    });
    contaminationLotId = created.id;
  }

  await logContaminationRoomEntry(client, {
    contaminationLotId,
    quantity: params.quantity,
    sourceLotId: params.sourceLotId,
    sourceLotCode: params.sourceLotCode,
    reportedById: params.reportedById,
    reason: params.reason,
  });

  await creditContaminationStaffBalance(client, {
    warehouseId: params.warehouseId,
    staffId: params.staffBalanceOwnerId,
    plantTypeId: params.plantTypeId,
    stageCode: params.stageCode,
    category: BALANCE_CATEGORY_BY_REASON[params.reason],
    quantity: params.quantity,
  });
}
