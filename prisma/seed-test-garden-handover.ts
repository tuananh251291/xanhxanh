// Dữ liệu TEST cho tính năng bàn giao cây về Vườn sản xuất — KHÔNG phải dữ liệu thật:
// - Khu sản xuất TEST (SX-TEST) + NV Kho mô TEST + NV sản xuất TEST; Phòng nhiễm có sẵn cây nhiễm để Kho mô
//   đề xuất Trồng → Admin duyệt → "Bàn giao cây trồng" → NV sản xuất xác nhận.
// - Kho thành phẩm TEST (KTP-TEST) + Quản lý kho TP TEST; Phòng chờ xử lý có sẵn cây để QL đề xuất Trồng (chọn
//   Vườn TEST) → Admin cấp cao duyệt → phiếu Bàn giao về Vườn → Quản lý vườn TEST xác nhận.
// - Vườn sản xuất TEST (VSX-TEST) + NV quản lý vườn TEST — tách khỏi vườn thật để không báo nhầm người thật.
// Mật khẩu mọi tài khoản: demo123.
//   npx tsx --env-file=.env prisma/seed-test-garden-handover.ts          → tạo (chạy lại = xoá cũ rồi tạo lại)
//   npx tsx --env-file=.env prisma/seed-test-garden-handover.ts --clean  → chỉ xoá
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
      await tx.lot.deleteMany({ where: { room: { warehouseId: { in: whIds } } } });
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
  const sum = (rows: [number, string, number][]) => rows.reduce((s, r) => s + r[2], 0);
  console.log(`Đã tạo: ${sx.name} (${SX_CODE}) — Phòng nhiễm ${NHIEM_ROWS.length} lô / ${sum(NHIEM_ROWS)} cây; ${ktp.name} (${KTP_CODE}) — Phòng chờ xử lý ${CXL_ROWS.length} lô / ${sum(CXL_ROWS)} cây; Vườn sản xuất TEST (${GARDEN_CODE}).`);
  for (const u of USERS) console.log(`  ${u.code} · ${u.role} · ${u.email} / demo123`);
}

(async () => {
  await clean();
  if (!process.argv.includes("--clean")) await seed();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
