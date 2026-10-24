// Dữ liệu TEST cho tính năng bàn giao cây về Vườn sản xuất — KHÔNG phải dữ liệu thật:
// - Khu sản xuất TEST (SX-TEST) + NV Kho mô TEST + NV sản xuất TEST; Phòng nhiễm có sẵn cây nhiễm để Kho mô
//   đề xuất Trồng → Admin duyệt → "Bàn giao cây trồng" → NV sản xuất xác nhận.
// - Kho thành phẩm TEST (KTP-TEST) + Quản lý kho TP TEST; Phòng chờ xử lý có sẵn cây để QL đề xuất Trồng (chọn
//   Vườn TEST) → Admin cấp cao duyệt → phiếu Bàn giao về Vườn → Quản lý vườn TEST xác nhận.
// - Vườn sản xuất TEST (VSX-TEST) + NV quản lý vườn TEST — tách khỏi vườn thật để không báo nhầm người thật.
// Mật khẩu mọi tài khoản: demo123.
//   npx tsx --env-file=.env prisma/seed-test-garden-handover.ts          → tạo (chạy lại = xoá cũ rồi tạo lại)
//   npx tsx --env-file=.env prisma/seed-test-garden-handover.ts --clean  → chỉ xoá
//   npx tsx --env-file=.env prisma/seed-test-garden-handover.ts --add-stock → chỉ (tạo lại) giàn kệ + cây ở Phòng
//     mẫu mẹ / Phòng ra rễ (SX-TEST) và Phòng đạt tiêu chuẩn (KTP-TEST), không đụng đề xuất/bàn giao đang test
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { createDefaultProductionRooms } from "../src/lib/warehouse-provisioning";

const SX_CODE = "SX-TEST";
const KTP_CODE = "KTP-TEST";
const GARDEN_CODE = "VSX-TEST";
const USERS = [
  { code: "TESTKM01", name: "TEST Kho mô", email: "test.khomo@xanhxanh.vn", role: "KHO_MO", warehouse: SX_CODE },
  { code: "TESTSX01", name: "TEST NV sản xuất", email: "test.nvsx@xanhxanh.vn", role: "NHAN_VIEN_SAN_XUAT", warehouse: SX_CODE },
  { code: "TESTQLTP01", name: "TEST Quản lý kho TP", email: "test.qlktp@xanhxanh.vn", role: "QUAN_LY_KHO_THANH_PHAM", warehouse: KTP_CODE },
  { code: "TESTQLV01", name: "TEST Quản lý vườn", email: "test.qlvuon@xanhxanh.vn", role: "NHAN_VIEN_QUAN_LY_VUON", warehouse: null },
] as const;
// [vị trí loại cây trong danh sách active, quy cách, số lượng]
const NHIEM_ROWS: [number, string, number][] = [[0, "T05", 40], [1, "T01", 25], [2, "T05", 60], [3, "T01", 15]];
const CXL_ROWS: [number, string, number][] = [[0, "T01", 120], [4, "T05", 80], [5, "T10", 50]];
// Phòng mẫu mẹ: 12 kệ (A01C01..A02C06), Nhóm tuần mẫu mẹ MM1..MM6 xoay vòng; mỗi dòng = [kệ, loại cây, quy cách, SL]
const MOTHER_SHELF_COUNT = 12;
const MOTHER_LOTS: [number, number, string, number][] = [
  [0, 0, "M05", 450], [0, 1, "M05", 300], [1, 2, "M05", 800], [2, 3, "M03", 250], [3, 4, "M05", 600],
  [4, 5, "M05", 520], [5, 0, "M03", 180], [6, 1, "M05", 700], [8, 2, "M05", 380], [10, 3, "M05", 640],
];
// Phòng ra rễ: 8 kệ (I01C01..I01C08), Nhóm tuần ra rễ 1..4 (2 kệ/nhóm); [kệ, loại cây, quy cách, SL, số tuần trước]
const ROOTING_SHELF_COUNT = 8;
const ROOTING_LOTS: [number, number, string, number, number][] = [
  [0, 0, "T05", 125, 1], [0, 1, "T01", 60, 1], [1, 2, "T05", 200, 1], [2, 3, "T05", 90, 2], [3, 4, "T01", 45, 2],
  [4, 5, "T05", 150, 3], [5, 0, "T01", 80, 3], [6, 1, "T05", 110, 4], [7, 2, "T05", 70, 4],
];
// Phòng đạt tiêu chuẩn (KTP-TEST) — Kho thành phẩm không dùng giàn kệ, lô gắn thẳng vào phòng.
const DTC_ROWS: [number, string, number][] = [[0, "T01", 300], [1, "T05", 250], [2, "T05", 400], [3, "T10", 150], [4, "T01", 90], [5, "T05", 220]];

async function clean() {
  const warehouses = await prisma.warehouse.findMany({ where: { code: { in: [SX_CODE, KTP_CODE] } }, select: { id: true } });
  const whIds = warehouses.map((w) => w.id);
  const users = await prisma.user.findMany({ where: { code: { in: USERS.map((u) => u.code) } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const garden = await prisma.productionGarden.findUnique({ where: { code: GARDEN_CODE }, select: { id: true } });
  try {
    await prisma.$transaction(async (tx) => {
      const proposals = await tx.contaminationProposal.findMany({
        where: { OR: [{ warehouseId: { in: whIds } }, ...(garden ? [{ productionGardenId: garden.id }] : [])] },
        select: { id: true },
      });
      const proposalIds = proposals.map((p) => p.id);
      await tx.alert.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { relatedId: { in: proposalIds } }] } });
      await tx.contaminationProposal.deleteMany({ where: { id: { in: proposalIds } } });
      await tx.replantHandover.deleteMany({ where: { warehouseId: { in: whIds } } });
      await tx.gardenHandover.deleteMany({ where: { OR: [{ warehouseId: { in: whIds } }, ...(garden ? [{ productionGardenId: garden.id }] : [])] } });
      await tx.dailyTask.deleteMany({ where: { OR: [{ warehouseId: { in: whIds } }, { assignedToId: { in: userIds } }] } });
      await tx.lot.deleteMany({ where: { OR: [{ room: { warehouseId: { in: whIds } } }, { shelf: { warehouseId: { in: whIds } } }] } });
      await tx.shelf.deleteMany({ where: { warehouseId: { in: whIds } } });
      await tx.room.deleteMany({ where: { warehouseId: { in: whIds } } });
      if (garden) await tx.productionGarden.delete({ where: { id: garden.id } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.warehouse.deleteMany({ where: { id: { in: whIds } } });
    });
    console.log(`Đã xoá dữ liệu TEST (${whIds.length} kho, ${userIds.length} tài khoản, ${garden ? 1 : 0} vườn).`);
  } catch (e) {
    console.error("Không xoá được (dữ liệu TEST đã phát sinh liên kết khác — cần xử lý tay):", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

async function seed() {
  const sx = await prisma.warehouse.create({ data: { code: SX_CODE, name: "Khu sản xuất TEST", type: "SAN_XUAT", description: "Dữ liệu TEST — test bàn giao về vườn" } });
  await createDefaultProductionRooms(sx.id, SX_CODE);
  const ktp = await prisma.warehouse.create({ data: { code: KTP_CODE, name: "Kho thành phẩm TEST", type: "THANH_PHAM", description: "Dữ liệu TEST — test bàn giao về vườn" } });
  await prisma.room.createMany({
    data: [
      { code: `${KTP_CODE}-DTC`, name: "Phòng đạt tiêu chuẩn", type: "PHONG_DAT_TIEU_CHUAN", warehouseId: ktp.id },
      { code: `${KTP_CODE}-CXL`, name: "Phòng chờ xử lý", type: "PHONG_CHO_XU_LY", warehouseId: ktp.id },
    ],
  });
  const whId = { [SX_CODE]: sx.id, [KTP_CODE]: ktp.id } as Record<string, string>;

  const password = await bcrypt.hash("demo123", 10);
  const created: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: { code: u.code, name: u.name, email: u.email, password, role: u.role, status: "APPROVED", workplaceWarehouseId: u.warehouse ? whId[u.warehouse] : null },
      select: { id: true },
    });
    created[u.code] = user.id;
  }
  await prisma.productionGarden.create({
    data: { code: GARDEN_CODE, name: "Vườn sản xuất TEST", address: "Dữ liệu TEST", managerId: created.TESTQLV01 },
  });

  const plantTypes = await prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true }, orderBy: { code: "asc" }, take: 6 });
  const nhiemRoom = await prisma.room.findFirstOrThrow({ where: { warehouseId: sx.id, type: "PHONG_NHIEM" }, select: { id: true } });
  const cxlRoom = await prisma.room.findFirstOrThrow({ where: { warehouseId: ktp.id, type: "PHONG_CHO_XU_LY" }, select: { id: true } });
  for (const [rows, roomId, prefix] of [[NHIEM_ROWS, nhiemRoom.id, `NHIEM-${SX_CODE}`], [CXL_ROWS, cxlRoom.id, `CXL-${KTP_CODE}`]] as const) {
    for (const [idx, stageCode, quantity] of rows) {
      const pt = plantTypes[idx];
      await prisma.lot.create({
        data: { code: `${prefix}-${pt.code}`, plantTypeId: pt.id, stage: "THANH_PHAM", stageCode, roomId, quantity, initialQuantity: quantity, status: "ACTIVE" },
      });
    }
  }
  await seedStock();
  const sum = (rows: [number, string, number][]) => rows.reduce((s, r) => s + r[2], 0);
  console.log(`Đã tạo: ${sx.name} (${SX_CODE}) — Phòng nhiễm ${NHIEM_ROWS.length} lô / ${sum(NHIEM_ROWS)} cây; ${ktp.name} (${KTP_CODE}) — Phòng chờ xử lý ${CXL_ROWS.length} lô / ${sum(CXL_ROWS)} cây; Vườn sản xuất TEST (${GARDEN_CODE}).`);
  for (const u of USERS) console.log(`  ${u.code} · ${u.role} · ${u.email} / demo123`);
}

// Giàn kệ + cây cho Phòng mẫu mẹ / Phòng ra rễ của SX-TEST và tồn Phòng đạt tiêu chuẩn của KTP-TEST — xoá phần
// cũ do chính hàm này tạo (kệ TEST + lô trên kệ, lô Phòng đạt tiêu chuẩn) rồi tạo lại.
async function seedStock() {
  const sx = await prisma.warehouse.findUniqueOrThrow({ where: { code: SX_CODE }, select: { id: true } });
  const ktp = await prisma.warehouse.findUniqueOrThrow({ where: { code: KTP_CODE }, select: { id: true } });
  const ref = await prisma.warehouse.findUnique({ where: { code: "SX-F" }, select: { motherRotationStartWeek: true, rootingRotationStartWeek: true } });
  // Cùng mốc "Tuần khởi đầu Nhóm 1" với Kim Động để lịch xoay vòng Nhóm tuần chạy giống kho thật.
  await prisma.warehouse.update({
    where: { id: sx.id },
    data: { motherRotationStartWeek: ref?.motherRotationStartWeek ?? null, rootingRotationStartWeek: ref?.rootingRotationStartWeek ?? null },
  });

  const [psRoom, prrRoom, dtcRoom] = await Promise.all([
    prisma.room.findFirstOrThrow({ where: { warehouseId: sx.id, type: "PHONG_MAU_ME" }, select: { id: true } }),
    prisma.room.findFirstOrThrow({ where: { warehouseId: sx.id, type: "PHONG_RA_RE" }, select: { id: true } }),
    prisma.room.findFirstOrThrow({ where: { warehouseId: ktp.id, type: "PHONG_DAT_TIEU_CHUAN" }, select: { id: true } }),
  ]);
  await prisma.lot.deleteMany({ where: { OR: [{ shelf: { roomId: { in: [psRoom.id, prrRoom.id] } } }, { roomId: dtcRoom.id }] } });
  await prisma.shelf.deleteMany({ where: { roomId: { in: [psRoom.id, prrRoom.id] } } });

  const groups = await prisma.shelfGroup.findMany({
    where: { rotationKind: { in: ["MAU_ME", "RA_RE"] } },
    select: { id: true, rotationKind: true },
    orderBy: { rotationOrder: "asc" },
  });
  const motherGroups = groups.filter((g) => g.rotationKind === "MAU_ME");
  const rootingGroups = groups.filter((g) => g.rotationKind === "RA_RE");
  const plantTypes = await prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true }, orderBy: { code: "asc" }, take: 6 });

  const makeShelves = async (roomId: string, prefix: string, count: number, blockOf: (i: number) => string, colOf: (i: number) => number, groupOf: (i: number) => string | null) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const block = blockOf(i);
      const col = colOf(i);
      const label = `${block}C${String(col).padStart(2, "0")}`;
      const shelf = await prisma.shelf.create({
        data: {
          code: `${prefix}-${label}`, name: `Kệ ${label}`, warehouseId: sx.id, roomId,
          rowNumber: Number(block.slice(1)), colNumber: col, block, capacity: 1500, rotationGroupId: groupOf(i),
        },
        select: { id: true },
      });
      ids.push(shelf.id);
    }
    return ids;
  };
  const motherShelves = await makeShelves(
    psRoom.id, `${SX_CODE}-PS`, MOTHER_SHELF_COUNT,
    (i) => `A${String(Math.floor(i / 6) + 1).padStart(2, "0")}`, (i) => (i % 6) + 1,
    (i) => motherGroups[i % motherGroups.length]?.id ?? null
  );
  const rootingShelves = await makeShelves(
    prrRoom.id, `${SX_CODE}-PRR`, ROOTING_SHELF_COUNT,
    () => "I01", (i) => i + 1,
    (i) => rootingGroups[Math.floor(i / 2) % rootingGroups.length]?.id ?? null
  );

  const weeksAgo = (n: number) => new Date(Date.now() - n * 7 * 86_400_000);
  let seq = 0;
  for (const [shelfIdx, ptIdx, stageCode, quantity] of MOTHER_LOTS) {
    const pt = plantTypes[ptIdx];
    seq++;
    await prisma.lot.create({
      data: {
        code: `TEST-MM-${pt.code}-${seq}`, plantTypeId: pt.id, stage: "MAU_ME", stageCode, shelfId: motherShelves[shelfIdx],
        quantity, initialQuantity: quantity, status: "ACTIVE", enteredAt: weeksAgo(1 + (seq % 4)),
      },
    });
  }
  for (const [shelfIdx, ptIdx, stageCode, quantity, ago] of ROOTING_LOTS) {
    const pt = plantTypes[ptIdx];
    seq++;
    await prisma.lot.create({
      data: {
        code: `TEST-RR-${pt.code}-${seq}`, plantTypeId: pt.id, stage: "THANH_PHAM", stageCode, shelfId: rootingShelves[shelfIdx],
        quantity, initialQuantity: quantity, status: "ACTIVE", enteredAt: weeksAgo(ago), darkRoomEnteredAt: weeksAgo(ago + 1),
      },
    });
  }
  for (const [ptIdx, stageCode, quantity] of DTC_ROWS) {
    const pt = plantTypes[ptIdx];
    await prisma.lot.create({
      data: {
        code: `DTC-${KTP_CODE}-${pt.code}-${stageCode}`, plantTypeId: pt.id, stage: "THANH_PHAM", stageCode, roomId: dtcRoom.id,
        quantity, initialQuantity: quantity, status: "ACTIVE",
      },
    });
  }
  const total = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
  console.log(
    `Giàn kệ: Phòng mẫu mẹ ${MOTHER_SHELF_COUNT} kệ / ${MOTHER_LOTS.length} lô / ${total(MOTHER_LOTS.map((r) => r[3]))} cây; ` +
    `Phòng ra rễ ${ROOTING_SHELF_COUNT} kệ / ${ROOTING_LOTS.length} lô / ${total(ROOTING_LOTS.map((r) => r[3]))} cây; ` +
    `Phòng đạt tiêu chuẩn (KTP-TEST) ${DTC_ROWS.length} lô / ${total(DTC_ROWS.map((r) => r[2]))} cây.`
  );
}

(async () => {
  if (process.argv.includes("--add-stock")) {
    await seedStock();
    process.exit(0);
  }
  await clean();
  if (!process.argv.includes("--clean")) await seed();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
