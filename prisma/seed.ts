import { PrismaClient } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { ROLE_NAV } from "@/types";
import { startOfWeek, subWeeks, subDays, addDays } from "date-fns";

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
    update: { role: "SUPER_ADMIN", status: "APPROVED" },
    create: {
      code: "NV001",
      name: "Admin",
      email: "admin@xanhxanh.vn",
      password: adminPass,
      role: "SUPER_ADMIN",
      status: "APPROVED",
    },
  });
  console.log("✅ Admin:", admin.email);

  // Demo users
  const demoPass = await bcrypt.hash("demo123", 10);
  const demoUsers = [
    { code: "NV002", name: "Nguyễn Kỹ Thuật", email: "kythuat@xanhxanh.vn", role: "KY_THUAT" as const },
    { code: "NV003", name: "Trần Thị Cấy 1", email: "caymo1@xanhxanh.vn", role: "CAY_MO" as const },
    { code: "NV009", name: "Nguyễn Thị Cấy 2", email: "caymo2@xanhxanh.vn", role: "CAY_MO" as const },
    { code: "NV010", name: "Lê Văn Cấy 3", email: "caymo3@xanhxanh.vn", role: "CAY_MO" as const },
    { code: "NV004", name: "Lê Văn Kho Mô", email: "khomo@xanhxanh.vn", role: "KHO_MO" as const },
    { code: "NV005", name: "Phạm Kho Thành Phẩm", email: "khothanhhpham@xanhxanh.vn", role: "KHO_THANH_PHAM" as const },
    { code: "NV006", name: "Hoàng Sale 1", email: "sale1@xanhxanh.vn", role: "SALE" as const },
    { code: "NV007", name: "Võ Môi Trường", email: "moitruong@xanhxanh.vn", role: "MOI_TRUONG" as const },
    { code: "NV008", name: "Đặng Điều Phối", email: "dieupho@xanhxanh.vn", role: "DIEU_PHOI" as const },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, status: "APPROVED" },
      create: { ...u, password: demoPass, status: "APPROVED" },
    });
  }
  console.log("✅ Demo users created");

  // Plant types
  const plantTypes = [
    { code: "AL", name: "Alocasia", lightRoomWeeksMin: 4, lightRoomWeeksMax: 6 },
    { code: "MT", name: "Monstera", lightRoomWeeksMin: 5, lightRoomWeeksMax: 7 },
    { code: "PD", name: "Philodendron", lightRoomWeeksMin: 4, lightRoomWeeksMax: 6 },
    { code: "AT", name: "Anthurium", lightRoomWeeksMin: 6, lightRoomWeeksMax: 8 },
    { code: "HM", name: "Homa", lightRoomWeeksMin: 4, lightRoomWeeksMax: 6 },
    { code: "EP", name: "Epi", lightRoomWeeksMin: 4, lightRoomWeeksMax: 5 },
    { code: "MS", name: "Musa", lightRoomWeeksMin: 5, lightRoomWeeksMax: 6 },
    { code: "RH", name: "Raphidophora", lightRoomWeeksMin: 4, lightRoomWeeksMax: 6 },
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

  // Tỉ lệ nhân/môi trường mặc định theo quy cách mẫu mẹ (M3/M5) — mỗi loại cây 1 bộ số liệu riêng cho M3 và M5.
  // Số liệu demo, Admin chỉnh lại theo thực tế qua trang /plant-types.
  const createdPlantTypes = await prisma.plantType.findMany();
  const createdMediumTypes = await prisma.mediumType.findMany({ orderBy: { code: "asc" } });
  const plantTypeSpecDefs: { stageCode: "M3" | "M5"; motherSampleRatio: number; rootingRatio: number; mediumIdx: number }[] = [
    { stageCode: "M3", motherSampleRatio: 3.0, rootingRatio: 0.8, mediumIdx: 0 },
    { stageCode: "M5", motherSampleRatio: 5.0, rootingRatio: 0.7, mediumIdx: 1 },
  ];
  for (const pt of createdPlantTypes) {
    for (const spec of plantTypeSpecDefs) {
      await prisma.plantTypeSpec.upsert({
        where: { plantTypeId_stageCode: { plantTypeId: pt.id, stageCode: spec.stageCode } },
        update: {},
        create: {
          plantTypeId: pt.id,
          stageCode: spec.stageCode,
          motherSampleRatio: spec.motherSampleRatio,
          rootingRatio: spec.rootingRatio,
          mediumTypeId: createdMediumTypes[spec.mediumIdx % createdMediumTypes.length].id,
        },
      });
    }
  }
  console.log("✅ Plant type specs (M3/M5) created");

  // Warehouses — 2 kho sản xuất (mỗi kho có phòng sáng + phòng tối) + 1 kho thành phẩm
  const warehouses = [
    { code: "SX-A", name: "Kho sản xuất A", type: "SAN_XUAT" as const },
    { code: "SX-B", name: "Kho sản xuất B", type: "SAN_XUAT" as const },
    { code: "KTP-A", name: "Kho thành phẩm A", type: "THANH_PHAM" as const },
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

  // Rooms — mỗi kho sản xuất có đúng 1 phòng sáng + 1 phòng tối;
  // kho thành phẩm có 3 phòng cố định + phòng thị trường (mở thêm được)
  const roomDefs = [
    { code: "SXA-PS", name: "Phòng sáng A", type: "PHONG_SANG" as const, warehouseCode: "SX-A" },
    { code: "SXA-PT", name: "Phòng tối A", type: "PHONG_TOI" as const, warehouseCode: "SX-A" },
    { code: "SXB-PS", name: "Phòng sáng B", type: "PHONG_SANG" as const, warehouseCode: "SX-B" },
    { code: "SXB-PT", name: "Phòng tối B", type: "PHONG_TOI" as const, warehouseCode: "SX-B" },
    { code: "KTPA-KD", name: "Phòng khả dụng", type: "PHONG_KHA_DUNG" as const, warehouseCode: "KTP-A" },
    { code: "KTPA-TD", name: "Phòng theo dõi", type: "PHONG_THEO_DOI" as const, warehouseCode: "KTP-A" },
    { code: "KTPA-HT", name: "Phòng hàn túi", type: "PHONG_HAN_TUI" as const, warehouseCode: "KTP-A" },
    { code: "KTPA-TT-SG", name: "Phòng thị trường Singapore", type: "PHONG_THI_TRUONG" as const, warehouseCode: "KTP-A" },
    { code: "KTPA-TT-RU", name: "Phòng thị trường Nga", type: "PHONG_THI_TRUONG" as const, warehouseCode: "KTP-A" },
  ];

  const createdRooms: { [key: string]: string } = {};
  for (const r of roomDefs) {
    const room = await prisma.room.upsert({
      where: { code: r.code },
      update: {},
      create: {
        code: r.code,
        name: r.name,
        type: r.type,
        warehouseId: createdWarehouses[r.warehouseCode],
      },
    });
    createdRooms[r.code] = room.id;
  }
  console.log("✅ Rooms created");

  // Shelves for phòng sáng (3x5 lưới mỗi phòng)
  for (const roomCode of ["SXA-PS", "SXB-PS"]) {
    const roomId = createdRooms[roomCode];
    const warehouseId = createdWarehouses[roomCode.startsWith("SXA") ? "SX-A" : "SX-B"];
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 5; col++) {
        const code = `${roomCode}-R${row}C${col}`;
        await prisma.shelf.upsert({
          where: { code },
          update: {},
          create: {
            code,
            name: `Kệ R${row}C${col}`,
            warehouseId,
            roomId,
            rowNumber: row,
            colNumber: col,
            capacity: 20,
          },
        });
      }
    }
  }

  // Shelves for phòng tối (10 kệ mỗi phòng)
  for (const roomCode of ["SXA-PT", "SXB-PT"]) {
    const roomId = createdRooms[roomCode];
    const warehouseId = createdWarehouses[roomCode.startsWith("SXA") ? "SX-A" : "SX-B"];
    for (let i = 1; i <= 10; i++) {
      const code = `${roomCode}-K${String(i).padStart(2, "0")}`;
      await prisma.shelf.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: `Kệ tối ${String(i).padStart(2, "0")}`,
          warehouseId,
          roomId,
          rowNumber: 1,
          colNumber: i,
          capacity: 30,
        },
      });
    }
  }

  // Shelves for các phòng trong Kho thành phẩm
  const ktpAId = createdWarehouses["KTP-A"];
  const ktpRoomShelfCounts: { [roomCode: string]: number } = {
    "KTPA-KD": 6,
    "KTPA-TD": 4,
    "KTPA-HT": 4,
    "KTPA-TT-SG": 3,
    "KTPA-TT-RU": 3,
  };
  for (const [roomCode, count] of Object.entries(ktpRoomShelfCounts)) {
    const roomId = createdRooms[roomCode];
    for (let i = 1; i <= count; i++) {
      const code = `${roomCode}-K${String(i).padStart(2, "0")}`;
      await prisma.shelf.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: `Kệ ${String(i).padStart(2, "0")}`,
          warehouseId: ktpAId,
          roomId,
          rowNumber: 1,
          colNumber: i,
          capacity: 50,
        },
      });
    }
  }
  console.log("✅ Shelves created");

  // Lots — mã lô cây dạng AABBBCC
  // AA   = mã loại cây (AL, MT, PD, AT, HM, EP, MS, RH)
  // BBB  = số thứ tự lô theo loại cây (001, 002, ...)
  // CC   = T01/T05/T10 (túi 1/5/10 - thành phẩm) hoặc M3/M5 (mẫu mẹ cụm 3/5 chồi)
  const STAGE_CODES: { code: string; stage: "THANH_PHAM" | "MAU_ME"; qtyRange: [number, number] }[] = [
    { code: "M3", stage: "MAU_ME", qtyRange: [30, 80] },
    { code: "M5", stage: "MAU_ME", qtyRange: [20, 60] },
    { code: "T01", stage: "THANH_PHAM", qtyRange: [50, 150] },
    { code: "T05", stage: "THANH_PHAM", qtyRange: [20, 60] },
    { code: "T10", stage: "THANH_PHAM", qtyRange: [10, 30] },
  ];

  const motherShelves = await prisma.shelf.findMany({
    where: { room: { type: "PHONG_SANG" } },
  });
  const finishedShelves = await prisma.shelf.findMany({
    where: { room: { type: "PHONG_KHA_DUNG" } },
  });
  const allPlantTypes = await prisma.plantType.findMany();

  function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const HISTORY_WEEKS = 10;

  let lotSeq = 0;
  for (const pt of allPlantTypes) {
    for (let i = 0; i < STAGE_CODES.length; i++) {
      const sc = STAGE_CODES[i];
      lotSeq += 1;
      const bbb = String(lotSeq).padStart(3, "0");
      const code = `${pt.code}${bbb}${sc.code}`;
      const quantity = randInt(sc.qtyRange[0], sc.qtyRange[1]);
      const shelves = sc.stage === "MAU_ME" ? motherShelves : finishedShelves;
      const shelf = shelves[randInt(0, shelves.length - 1)];
      // Rải enteredAt xuyên suốt HISTORY_WEEKS tuần qua (xác định, không random) để báo cáo tồn kho có dữ liệu lịch sử
      const enteredAt = subDays(new Date(), (lotSeq * 5 + allPlantTypes.indexOf(pt) * 9) % (HISTORY_WEEKS * 7));

      await prisma.lot.upsert({
        where: { code },
        update: { enteredAt },
        create: {
          code,
          plantTypeId: pt.id,
          stage: sc.stage,
          stageCode: sc.code,
          shelfId: shelf?.id,
          quantity,
          initialQuantity: quantity,
          status: "ACTIVE",
          enteredAt,
        },
      });
    }
    lotSeq = 0; // reset numbering per plant type (BBB is per-loại-cây)
  }
  console.log("✅ Lots created (mã lô cây AABBBCC)");

  // ============================================================
  // Lịch sử demo cho báo cáo — chỉ định cấy, nhật ký hàng ngày, lô nhiễm
  // trải dài HISTORY_WEEKS tuần qua. Đánh dấu "[SEED]" để idempotent.
  // ============================================================
  const seededHistoryCount = await prisma.dailyRecord.count({ where: { notes: { startsWith: "[SEED]" } } });
  if (seededHistoryCount > 0) {
    console.log("⏭️  Lịch sử demo báo cáo đã tồn tại, bỏ qua (đã có", seededHistoryCount, "nhật ký [SEED])");
  } else {
    // RNG xác định (cùng seed → cùng kết quả mỗi lần chạy) để số liệu dễ đối chiếu lại
    function seededRng(seed: number) {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    }
    const rng = seededRng(42);

    const caymoStaff = await prisma.user.findMany({ where: { role: "CAY_MO" }, orderBy: { code: "asc" } });
    const kyThuat = await prisma.user.findUnique({ where: { email: "kythuat@xanhxanh.vn" } });
    const allMediumTypes = await prisma.mediumType.findMany();

    // Tỉ lệ nhiễm theo từng NV: caymo1 cải thiện dần, caymo2 ổn định, caymo3 có vấn đề
    function contaminationRate(staffIdx: number, weeksAgo: number) {
      if (staffIdx === 0) return 0.05 + weeksAgo * 0.017; // ~20% (9 tuần trước) → ~5% (tuần này)
      if (staffIdx === 1) return 0.09 + (((weeksAgo * 7) % 5) - 2) * 0.01; // dao động quanh 9%
      return 0.14 + (weeksAgo % 4) * 0.025; // 14%-21.5%, thường xuyên vượt ngưỡng 20%
    }

    if (kyThuat && caymoStaff.length > 0) {
      for (let weeksAgo = HISTORY_WEEKS - 1; weeksAgo >= 0; weeksAgo--) {
        const weekStart = startOfWeek(subWeeks(new Date(), weeksAgo), { weekStartsOn: 1 });

        for (let staffIdx = 0; staffIdx < caymoStaff.length; staffIdx++) {
          const staff = caymoStaff[staffIdx];
          const pt = allPlantTypes[(weeksAgo + staffIdx) % allPlantTypes.length];
          const mt = allMediumTypes[(weeksAgo + staffIdx) % allMediumTypes.length];

          const inputMotherQuantity = 100 + ((weeksAgo * 7 + staffIdx * 13) % 60);
          const expectedMotherOutput = Math.round(inputMotherQuantity * 0.75);
          const expectedFinishedOutput = Math.round(expectedMotherOutput * 1.6);

          const instructionCode = `SEED-INSTR-${weeksAgo}-${staffIdx}`;
          const instruction = await prisma.plantingInstruction.upsert({
            where: { code: instructionCode },
            update: {},
            create: {
              code: instructionCode,
              plantTypeId: pt.id,
              mediumTypeId: mt.id,
              createdById: kyThuat.id,
              assignedToId: staff.id,
              motherSampleRatio: 0.75,
              inputMotherQuantity,
              expectedMotherOutput,
              expectedFinishedOutput,
              weekStart,
              status: weeksAgo >= 2 ? "COMPLETED" : "ACTIVE",
            },
          });

          // Cố ý lệch >20% ở một số tuần để báo cáo "kế hoạch vs thực tế" có ví dụ thực tế
          const deviates = (weeksAgo + staffIdx) % 4 === 0;
          const actualMotherTotal = deviates
            ? Math.round(expectedMotherOutput * (staffIdx % 2 === 0 ? 1.35 : 0.6))
            : Math.round(expectedMotherOutput * (0.9 + rng() * 0.2));
          const actualFinishedTotal = Math.round(expectedFinishedOutput * (0.9 + rng() * 0.2));

          // Chia đều thành 3 nhật ký hàng ngày trong tuần
          const dayOffsets = [0, 2, 4];
          let firstMotherLotId: string | null = null;
          for (let recIdx = 0; recIdx < 3; recIdx++) {
            const recordDate = addDays(weekStart, dayOffsets[recIdx]);
            const motherQty = Math.round(actualMotherTotal / 3);
            const finishedQty = Math.round(actualFinishedTotal / 3);

            const dailyRecord = await prisma.dailyRecord.create({
              data: {
                instructionId: instruction.id,
                staffId: staff.id,
                recordDate,
                motherUsed: Math.round(inputMotherQuantity / 3),
                notes: "[SEED] lịch sử demo báo cáo",
              },
            });

            const motherLot = await prisma.lot.create({
              data: {
                code: `SEED-LOT-${weeksAgo}-${staffIdx}-${recIdx}-MM`,
                plantTypeId: pt.id,
                stage: "MAU_ME",
                stageCode: "SEED",
                shelfId: motherShelves[(weeksAgo + staffIdx + recIdx) % motherShelves.length]?.id,
                quantity: motherQty,
                initialQuantity: motherQty,
                status: "ACTIVE",
                enteredAt: recordDate,
                instructionId: instruction.id,
              },
            });
            if (recIdx === 0) firstMotherLotId = motherLot.id;

            const finishedLot = await prisma.lot.create({
              data: {
                code: `SEED-LOT-${weeksAgo}-${staffIdx}-${recIdx}-TP`,
                plantTypeId: pt.id,
                stage: "THANH_PHAM",
                stageCode: "SEED",
                shelfId: finishedShelves[(weeksAgo + staffIdx + recIdx) % finishedShelves.length]?.id,
                quantity: finishedQty,
                initialQuantity: finishedQty,
                status: "ACTIVE",
                enteredAt: recordDate,
                instructionId: instruction.id,
              },
            });

            await prisma.dailyRecordItem.createMany({
              data: [
                { dailyRecordId: dailyRecord.id, lotId: motherLot.id, stage: "MAU_ME", quantityCreated: motherQty },
                { dailyRecordId: dailyRecord.id, lotId: finishedLot.id, stage: "THANH_PHAM", quantityCreated: finishedQty },
              ],
            });
          }

          // Lô nhiễm — 1 bản ghi/tuần/NV, số lượng = tổng mẫu mẹ thực tế * tỉ lệ nhiễm của NV tuần đó
          if (firstMotherLotId) {
            const rate = contaminationRate(staffIdx, weeksAgo);
            const contamQty = Math.max(1, Math.round(actualMotherTotal * rate));
            await prisma.contaminationRecord.create({
              data: {
                lotId: firstMotherLotId,
                quantity: contamQty,
                recordDate: addDays(weekStart, 1 + (weeksAgo % 3)),
                confirmedAt: addDays(weekStart, 1 + (weeksAgo % 3)),
                notes: "[SEED] lịch sử demo báo cáo",
              },
            });
          }
        }
      }
      console.log(`✅ Lịch sử demo báo cáo tạo xong (${HISTORY_WEEKS} tuần x ${caymoStaff.length} NV cấy mô)`);
    }
  }

  // Role permissions — mặc định bật đúng theo ROLE_NAV hiện có (trừ /dashboard, luôn được phép)
  for (const [role, items] of Object.entries(ROLE_NAV)) {
    for (const item of items) {
      if (item.href === "/dashboard") continue;
      await prisma.rolePermission.upsert({
        where: { role_href: { role: role as UserRole, href: item.href } },
        update: {},
        create: { role: role as UserRole, href: item.href, enabled: true },
      });
    }
  }
  console.log("✅ Role permissions created");

  console.log("\n🎉 Seed completed!");
  console.log("📧 Login: admin@xanhxanh.vn / admin123");
  console.log("📧 Demo accounts: [role]@xanhxanh.vn / demo123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
