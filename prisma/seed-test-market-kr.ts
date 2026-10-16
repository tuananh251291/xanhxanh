// Giả lập tồn kho Kho thị trường Hàn Quốc (TT-C) để test tính năng — KHÔNG phải dữ liệu thật.
// Mọi lô tạo ra có mã bắt đầu bằng "TEST" để nhận biết và xoá sạch:
//   npx tsx --env-file=.env prisma/seed-test-market-kr.ts          → tạo (chạy lại = xoá cũ rồi tạo lại)
//   npx tsx --env-file=.env prisma/seed-test-market-kr.ts --clean  → chỉ xoá
// Chỉ xoá được lô TEST chưa phát sinh liên kết (đơn/xuất/kiểm tra...) — lô đã dùng trong test sẽ được liệt
// kê để xử lý tay, không xoá cưỡng bức.
import { prisma } from "../src/lib/prisma";

const WAREHOUSE_CODE = "TT-C";
const TEST_PREFIX = "TEST";

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
  const lots = await prisma.lot.findMany({
    where: { code: { startsWith: TEST_PREFIX }, room: { warehouse: { code: WAREHOUSE_CODE } } },
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
}

(async () => {
  await clean();
  if (!process.argv.includes("--clean")) await seed();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
