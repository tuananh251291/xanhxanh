// Giả lập tồn kho Kho thị trường Hàn Quốc (TT-C) để test tính năng — KHÔNG phải dữ liệu thật.
// Gồm: lô tồn ở 3 phòng + 1 phiếu gửi hàng Kho TP → TT-C đang chờ Đối tác vận hành xác nhận (/market-receive).
// Mọi lô tạo ra có mã bắt đầu bằng "TEST", phiếu gửi có ghi chú bắt đầu bằng "[TEST]" để nhận biết và xoá sạch:
//   npx tsx --env-file=.env prisma/seed-test-market-kr.ts          → tạo (chạy lại = xoá cũ rồi tạo lại)
//   npx tsx --env-file=.env prisma/seed-test-market-kr.ts --clean  → chỉ xoá
// Chỉ xoá được lô TEST chưa phát sinh liên kết (đơn/xuất/kiểm tra...) — lô đã dùng trong test sẽ được liệt
// kê để xử lý tay, không xoá cưỡng bức.
import { prisma } from "../src/lib/prisma";
import { generateTransferCode } from "../src/lib/codes";

const WAREHOUSE_CODE = "TT-C";
const TEST_PREFIX = "TEST";
const TRANSFER_TAG = "[TEST]";

// Phiếu gửi giả — [vị trí loại cây, quy cách, số lượng]. Cố ý trùng combo với lô TEST đã có ở CẢ Phòng sản
// phẩm đạt lẫn không đạt, để lúc Đối tác xác nhận (upsertLot cộng dồn vào lô ACTIVE cùng combo) số nhận vào
// rơi vào lô TEST, không sinh lô thật mới.
const TRANSFER_ROWS: [number, string, number][] = [
  [0, "T01", 50], [2, "T05", 40], [7, "T10", 30],
];

// [mã cây, quy cách, số lượng] — chọn theo vị trí trong danh sách loại cây active để không phụ thuộc mã cụ thể.
const SPD_ROWS: [number, string, number][] = [
  [0, "T01", 120], [0, "T05", 85], [1, "T01", 64], [2, "T05", 210], [3, "T10", 150],
  [4, "T01", 33], [5, "T05", 95], [6, "T01", 8], [7, "T10", 300], [8, "T05", 45],
  [9, "T01", 72], [10, "T05", 15],
];
const SPKD_ROWS: [number, string, number][] = [
  [0, "T01", 12], [2, "T05", 7], [4, "T01", 21], [7, "T10", 4], [11, "T01", 3],
];
const CT_ROWS: [number, string, number][] = [
  [1, "S", 40], [1, "M", 18], [3, "L", 6], [5, "S", 55], [6, "M", 22], [9, "C", 9],
];

async function clean() {
  // Phiếu gửi TEST (cả đã xác nhận) + mọi thứ sinh ra từ nó: phân loại hàng không đạt, kiểm tra, thông báo.
  const transfers = await prisma.transfer.findMany({
    where: { notes: { startsWith: TRANSFER_TAG }, toWarehouse: { code: WAREHOUSE_CODE } },
    select: { id: true, code: true, rejectedGoodsClassification: { select: { id: true } } },
  });
  for (const t of transfers) {
    const classificationId = t.rejectedGoodsClassification?.id;
    await prisma.$transaction(async (tx) => {
      if (classificationId) {
        await tx.rejectedGoodsClassificationItem.deleteMany({ where: { classificationId } });
        await tx.rejectedGoodsClassification.delete({ where: { id: classificationId } });
      }
      await tx.alert.deleteMany({ where: { relatedId: { in: [t.id, ...(classificationId ? [classificationId] : [])] } } });
      await tx.transferInspection.deleteMany({ where: { transferId: t.id } });
      await tx.transferItem.deleteMany({ where: { transferId: t.id } });
      await tx.transfer.delete({ where: { id: t.id } });
    });
  }
  if (transfers.length) console.log(`Đã xoá ${transfers.length} phiếu gửi TEST: ${transfers.map((t) => t.code).join(", ")}`);

  const lots = await prisma.lot.findMany({
    where: { code: { startsWith: TEST_PREFIX } },
    select: { id: true, code: true, stageCode: true },
  });
  let deleted = 0;
  const kept: string[] = [];
  for (const lot of lots) {
    try {
      await prisma.lot.delete({ where: { id: lot.id } });
      deleted++;
    } catch {
      kept.push(`${lot.code} (${lot.stageCode})`);
    }
  }
  console.log(`Đã xoá ${deleted} lô TEST.`);
  if (kept.length) console.log(`Không xoá được ${kept.length} lô (đã có dữ liệu liên kết): ${kept.join(", ")}`);
}

async function seed() {
  const warehouse = await prisma.warehouse.findUnique({
    where: { code: WAREHOUSE_CODE },
    select: { id: true, name: true, rooms: { select: { id: true, type: true } } },
  });
  if (!warehouse) throw new Error(`Không tìm thấy kho ${WAREHOUSE_CODE}`);
  const roomId = (type: string) => {
    const room = warehouse.rooms.find((r) => r.type === type);
    if (!room) throw new Error(`Kho ${WAREHOUSE_CODE} thiếu phòng ${type}`);
    return room.id;
  };
  const plantTypes = await prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true }, orderBy: { code: "asc" }, take: 12 });
  if (plantTypes.length < 12) throw new Error("Cần ít nhất 12 loại cây active");

  const groups: [string, string, [number, string, number][]][] = [
    ["PHONG_SAN_PHAM_DAT", "", SPD_ROWS],
    ["PHONG_SAN_PHAM_KHONG_DAT", "-2", SPKD_ROWS],
    ["PHONG_CAY_TRONG", "-3", CT_ROWS],
  ];
  let count = 0;
  for (const [type, suffix, rows] of groups) {
    for (const [idx, stageCode, quantity] of rows) {
      const pt = plantTypes[idx];
      // Rải ngày nhập trong 30 ngày gần nhất để test lọc/sắp xếp theo ngày.
      const enteredAt = new Date(Date.now() - ((idx * 7 + count * 3) % 30) * 86_400_000);
      await prisma.lot.create({
        data: {
          code: `${TEST_PREFIX}${pt.code}KR${suffix}`,
          plantTypeId: pt.id,
          stage: "THANH_PHAM",
          stageCode,
          roomId: roomId(type),
          quantity,
          initialQuantity: quantity,
          status: "ACTIVE",
          enteredAt,
        },
      });
      count++;
    }
  }
  console.log(`Đã tạo ${count} lô TEST ở ${warehouse.name} (${WAREHOUSE_CODE}).`);

  await seedPendingTransfer(warehouse.id, plantTypes);
}

// Lô nguồn ở Kho TP để status TRANSFERRED (hàng đã rời kho) — không hiện ở bất kỳ trang tồn ACTIVE nào, nên
// không làm sai tồn thật / tồn đạt tiêu chuẩn của Sale; lúc xác nhận, route trừ quantity của chính lô này.
async function seedPendingTransfer(toWarehouseId: string, plantTypes: { id: string; code: string }[]) {
  const sourceRoom = await prisma.room.findFirst({
    where: { type: "PHONG_DAT_TIEU_CHUAN", isActive: true, warehouse: { type: "THANH_PHAM", isActive: true } },
    select: { id: true, warehouseId: true, warehouse: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!sourceRoom) throw new Error("Không tìm thấy Phòng đạt tiêu chuẩn của Kho thành phẩm nào");
  const sender =
    (await prisma.user.findFirst({ where: { role: "QUAN_LY_KHO_THANH_PHAM", isActive: true }, select: { id: true, name: true } })) ??
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true, name: true } }));
  if (!sender) throw new Error("Không tìm thấy người gửi (Quản lý kho TP / Admin cấp cao)");

  const sourceLots: { id: string; quantity: number }[] = [];
  for (const [idx, stageCode, quantity] of TRANSFER_ROWS) {
    const pt = plantTypes[idx];
    sourceLots.push(await prisma.lot.create({
      data: {
        code: `${TEST_PREFIX}${pt.code}KR-SEND`,
        plantTypeId: pt.id,
        stage: "THANH_PHAM",
        stageCode,
        roomId: sourceRoom.id,
        quantity,
        initialQuantity: quantity,
        status: "TRANSFERRED",
      },
    }));
  }

  const transfer = await prisma.$transaction(async (tx) => tx.transfer.create({
    data: {
      code: await generateTransferCode(tx),
      fromWarehouseId: sourceRoom.warehouseId,
      fromRoomId: sourceRoom.id,
      toWarehouseId,
      fromUserId: sender.id,
      notes: `${TRANSFER_TAG} Phiếu gửi giả lập để test nhận hàng Kho thị trường Hàn Quốc`,
      items: { create: sourceLots.map((l) => ({ lotId: l.id, quantity: l.quantity })) },
    },
    select: { id: true, code: true },
  }));

  // Giống POST /api/transfers khi gửi tới Kho thị trường — báo cho Đối tác vận hành của kho đó.
  const partners = await prisma.user.findMany({
    where: { role: "DOI_TAC_VAN_HANH", workplaceWarehouseId: toWarehouseId, isActive: true },
    select: { id: true, name: true },
  });
  if (partners.length) {
    await prisma.alert.createMany({
      data: partners.map((u) => ({
        type: "LOT_READY_TRANSFER" as const,
        userId: u.id,
        title: "Có phiếu gửi hàng từ Kho thành phẩm chờ nhận",
        message: `${sender.name} đã gửi phiếu ${transfer.code} — ${sourceLots.length} lô, chờ xác nhận nhận hàng`,
        relatedId: transfer.id,
        relatedType: "Transfer",
      })),
    });
  }
  const total = sourceLots.reduce((sum, l) => sum + l.quantity, 0);
  console.log(`Đã tạo phiếu gửi ${transfer.code} (${sourceRoom.warehouse.name} → ${WAREHOUSE_CODE}, ${sourceLots.length} dòng, ${total} cây), chờ xác nhận. Đã báo: ${partners.map((u) => u.name).join(", ") || "(không có Đối tác vận hành)"}`);
}

(async () => {
  await clean();
  if (!process.argv.includes("--clean")) await seed();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
