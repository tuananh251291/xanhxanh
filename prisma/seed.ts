import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // System configs
  await prisma.systemConfig.upsert({
    where: { key: "default_hold_days" },
    update: {},
    create: { key: "default_hold_days", value: "3", description: "Số ngày giữ đơn mặc định cho sale" },
  });
  await prisma.systemConfig.upsert({
    where: { key: "dark_room_days" },
    update: {},
    create: { key: "dark_room_days", value: "7", description: "Số ngày lưu tại phòng tối" },
  });
  await prisma.systemConfig.upsert({
    where: { key: "contamination_alert_pct" },
    update: {},
    create: { key: "contamination_alert_pct", value: "20", description: "Ngưỡng % tỉ lệ nhiễm để cảnh báo" },
  });

  // Admin user
  const adminPass = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@xanhxanh.vn" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@xanhxanh.vn",
      password: adminPass,
      role: "ADMIN",
    },
  });
  console.log("✅ Admin:", admin.email);

  // Demo users
  const demoPass = await bcrypt.hash("demo123", 10);
  const demoUsers = [
    { name: "Nguyễn Kỹ Thuật", email: "kythuat@xanhxanh.vn", role: "KY_THUAT" as const },
    { name: "Trần Thị Cấy 1", email: "caymo1@xanhxanh.vn", role: "CAY_MO" as const },
    { name: "Lê Văn Kho Mô", email: "khomo@xanhxanh.vn", role: "KHO_MO" as const },
    { name: "Phạm Kho Thành Phẩm", email: "khothanhhpham@xanhxanh.vn", role: "KHO_THANH_PHAM" as const },
    { name: "Hoàng Sale 1", email: "sale1@xanhxanh.vn", role: "SALE" as const },
    { name: "Võ Môi Trường", email: "moitruong@xanhxanh.vn", role: "MOI_TRUONG" as const },
    { name: "Đặng Điều Phối", email: "dieupho@xanhxanh.vn", role: "DIEU_PHOI" as const },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: demoPass },
    });
  }
  console.log("✅ Demo users created");

  // Plant types
  const plantTypes = [
    { code: "CAY001", name: "Chuối", lightRoomWeeksMin: 4, lightRoomWeeksMax: 6 },
    { code: "CAY002", name: "Dứa", lightRoomWeeksMin: 5, lightRoomWeeksMax: 6 },
    { code: "CAY003", name: "Lan Hồ Điệp", lightRoomWeeksMin: 6, lightRoomWeeksMax: 8 },
    { code: "CAY004", name: "Khoai Lang Nhật", lightRoomWeeksMin: 4, lightRoomWeeksMax: 5 },
  ];
  for (const pt of plantTypes) {
    await prisma.plantType.upsert({
      where: { code: pt.code },
      update: {},
      create: pt,
    });
  }
  console.log("✅ Plant types created");

  // Medium types
  const mediumTypes = [
    { code: "MT001", name: "Môi trường MS cơ bản" },
    { code: "MT002", name: "Môi trường MS + BAP 0.5" },
    { code: "MT003", name: "Môi trường MS + IBA 1.0" },
  ];
  for (const mt of mediumTypes) {
    await prisma.mediumType.upsert({
      where: { code: mt.code },
      update: {},
      create: mt,
    });
  }
  console.log("✅ Medium types created");

  // Warehouses
  const warehouses = [
    { code: "PT-A", name: "Phòng tối A", type: "PHONG_TOI" as const },
    { code: "KS-A", name: "Kho sáng A", type: "KHO_SANG" as const },
    { code: "KS-B", name: "Kho sáng B", type: "KHO_SANG" as const },
    { code: "KTP-A", name: "Kho thành phẩm A", type: "KHO_THANH_PHAM" as const },
  ];

  const createdWarehouses: { [key: string]: string } = {};
  for (const wh of warehouses) {
    const w = await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: {},
      create: wh,
    });
    createdWarehouses[wh.code] = w.id;
  }
  console.log("✅ Warehouses created");

  // Shelves for Kho sáng A
  const ksAId = createdWarehouses["KS-A"];
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 5; col++) {
      const code = `KSA-R${row}C${col}`;
      await prisma.shelf.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: `Kệ R${row}C${col}`,
          warehouseId: ksAId,
          rowNumber: row,
          colNumber: col,
          capacity: 20,
        },
      });
    }
  }

  // Shelves for Phòng tối A
  const ptAId = createdWarehouses["PT-A"];
  for (let i = 1; i <= 10; i++) {
    const code = `PTA-K${String(i).padStart(2, "0")}`;
    await prisma.shelf.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: `Kệ tối ${String(i).padStart(2, "0")}`,
        warehouseId: ptAId,
        rowNumber: 1,
        colNumber: i,
        capacity: 30,
      },
    });
  }

  // Shelves for Kho thành phẩm
  const ktpAId = createdWarehouses["KTP-A"];
  for (let i = 1; i <= 8; i++) {
    const code = `KTPA-K${String(i).padStart(2, "0")}`;
    await prisma.shelf.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: `Kệ TP ${String(i).padStart(2, "0")}`,
        warehouseId: ktpAId,
        rowNumber: 1,
        colNumber: i,
        capacity: 50,
      },
    });
  }
  console.log("✅ Shelves created");

  console.log("\n🎉 Seed completed!");
  console.log("📧 Login: admin@xanhxanh.vn / admin123");
  console.log("📧 Demo accounts: [role]@xanhxanh.vn / demo123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
