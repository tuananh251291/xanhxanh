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

  // Plant categories (Loại cây, mã 2 ký tự) — mỗi loại cây có 1 chi tiết demo mặc định (seq=1, tên trùng
  // Loại cây, VD "MT001" = "Monstera") cộng thêm nhiều giống cụ thể khác (varieties) trong cùng chi đó.
  // Admin thêm/sửa chi tiết loại cây qua trang /plant-types sau này.
  const plantCategories = [
    {
      code: "AL", name: "Alocasia", transferWaitWeeks: 4, rootingWeeks: 5,
      varieties: [
        "Alocasia Amazonica", "Alocasia Polly", "Alocasia Frydek", "Alocasia Silver Dragon",
        "Alocasia Black Velvet", "Alocasia Cuprea", "Alocasia Zebrina",
      ],
    },
    {
      code: "MT", name: "Monstera", transferWaitWeeks: 5, rootingWeeks: 6,
      varieties: [
        "Monstera Deliciosa", "Monstera Adansonii", "Monstera Albo Variegata", "Monstera Thai Constellation",
        "Monstera Peru", "Monstera Obliqua", "Monstera Standleyana",
      ],
    },
    {
      code: "PD", name: "Philodendron", transferWaitWeeks: 4, rootingWeeks: 5,
      varieties: [
        "Philodendron Birkin", "Philodendron Pink Princess", "Philodendron Selloum", "Philodendron Melanochrysum",
        "Philodendron Micans", "Philodendron Florida Ghost", "Philodendron White Knight",
      ],
    },
    {
      code: "AT", name: "Anthurium", transferWaitWeeks: 6, rootingWeeks: 6,
      varieties: [
        "Anthurium Crystallinum", "Anthurium Clarinervium", "Anthurium Warocqueanum", "Anthurium Veitchii",
        "Anthurium Andraeanum", "Anthurium Magnificum",
      ],
    },
    {
      code: "HM", name: "Homa", transferWaitWeeks: 4, rootingWeeks: 5,
      varieties: [
        "Homalomena Rubescens", "Homalomena Emerald Gem", "Homalomena Selby", "Homalomena Maggy",
        "Homalomena Pink Diamond", "Homalomena Cordata",
      ],
    },
    {
      code: "EP", name: "Epi", transferWaitWeeks: 4, rootingWeeks: 5,
      varieties: [
        "Epipremnum Aureum", "Epipremnum Marble Queen", "Epipremnum N'Joy", "Epipremnum Pinnatum",
        "Epipremnum Cebu Blue", "Epipremnum Manjula",
      ],
    },
    {
      code: "MS", name: "Musa", transferWaitWeeks: 5, rootingWeeks: 5,
      varieties: [
        "Musa Basjoo", "Musa Velutina", "Musa Ornata", "Musa Siam Ruby",
        "Musa Zebrina", "Musa Thai Black",
      ],
    },
    {
      code: "RH", name: "Raphidophora", transferWaitWeeks: 4, rootingWeeks: 5,
      varieties: [
        "Raphidophora Tetrasperma", "Raphidophora Decursiva", "Raphidophora Korthalsii", "Raphidophora Hayi",
        "Raphidophora Pachyphylla", "Raphidophora Cryptantha",
      ],
    },
  ];
  for (const pc of plantCategories) {
    const category = await prisma.plantCategory.upsert({
      where: { code: pc.code },
      update: {},
      create: { code: pc.code, name: pc.name },
    });
    const names = [pc.name, ...pc.varieties];
    for (let i = 0; i < names.length; i++) {
      const seq = i + 1;
      const code = `${pc.code}${String(seq).padStart(3, "0")}`;
      await prisma.plantType.upsert({
        where: { code },
        update: {},
        create: {
          categoryId: category.id,
          seq,
          code,
          name: names[i],
          transferWaitWeeks: pc.transferWaitWeeks,
          rootingWeeks: pc.rootingWeeks,
        },
      });
    }
  }
  console.log("✅ Plant categories + plant types created");

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

  // orderBy cố định để thứ tự luôn giống nhau giữa các lần seed — nếu không, việc gán kệ↔loại cây theo
  // vòng lặp bên dưới sẽ lệch mỗi lần chạy lại, trong khi lô cũ (upsert, không đổi shelfId) vẫn ở kệ cũ.
  // Không seed tỉ lệ nhân/môi trường mặc định (PlantTypeSpec đã bỏ) — KY_THUAT tự nhập theo thực tế khi
  // tạo chỉ định cấy.
  const createdPlantTypes = await prisma.plantType.findMany({ orderBy: { code: "asc" } });

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

  // Rooms — mỗi kho sản xuất có "Kho sáng" (chia 2: Phòng mẫu mẹ + Phòng ra rễ) + 1 phòng tối;
  // kho thành phẩm có 3 phòng cố định + phòng thị trường (mở thêm được)
  const roomDefs = [
    { code: "SXA-PS", name: "Phòng mẫu mẹ A", type: "PHONG_MAU_ME" as const, warehouseCode: "SX-A" },
    { code: "SXA-PRR", name: "Phòng ra rễ A", type: "PHONG_RA_RE" as const, warehouseCode: "SX-A" },
    { code: "SXA-PT", name: "Phòng tối A", type: "PHONG_TOI" as const, warehouseCode: "SX-A" },
    { code: "SXB-PS", name: "Phòng mẫu mẹ B", type: "PHONG_MAU_ME" as const, warehouseCode: "SX-B" },
    { code: "SXB-PRR", name: "Phòng ra rễ B", type: "PHONG_RA_RE" as const, warehouseCode: "SX-B" },
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
      update: { name: r.name, type: r.type },
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

  // Shelves for phòng mẫu mẹ (3x5 lưới mỗi phòng) — mỗi kệ chỉ xếp 1 mã cây (SUPER_ADMIN chỉ định), tối đa
  // 1800 cụm mẫu mẹ (quantity túi × 3 hoặc × 5 tùy quy cách M03/M05 — xem motherClusterUnits trong types/index.ts).
  // Gán xoay vòng qua các loại cây đã tạo để có sẵn dữ liệu demo cho tính năng này.
  const psCaymoStaff = await prisma.user.findMany({ where: { role: "CAY_MO" }, orderBy: { code: "asc" } });
  let psShelfSeq = 0;
  const psShelfPlantType: Record<string, string> = {};
  for (const roomCode of ["SXA-PS", "SXB-PS"]) {
    const roomId = createdRooms[roomCode];
    const warehouseId = createdWarehouses[roomCode.startsWith("SXA") ? "SX-A" : "SX-B"];
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 5; col++) {
        const code = `${roomCode}-R${row}C${col}`;
        const plantType = createdPlantTypes[psShelfSeq % createdPlantTypes.length];
        const staff = psCaymoStaff.length > 0 ? psCaymoStaff[psShelfSeq % psCaymoStaff.length] : null;
        psShelfSeq += 1;
        psShelfPlantType[code] = plantType.id;
        await prisma.shelf.upsert({
          where: { code },
          update: { plantTypeId: plantType.id, assignedStaffId: staff?.id, capacity: 1800 },
          create: {
            code,
            name: `Kệ R${row}C${col}`,
            warehouseId,
            roomId,
            rowNumber: row,
            colNumber: col,
            capacity: 1800,
            plantTypeId: plantType.id,
            assignedStaffId: staff?.id,
          },
        });
      }
    }
  }

  // Shelves for phòng ra rễ (3x5 lưới mỗi phòng) — không ràng buộc mã cây/nhân viên/capacity.
  for (const roomCode of ["SXA-PRR", "SXB-PRR"]) {
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

  // Lots — mã lô cây dạng <mã chi tiết loại cây><quy cách>, VD "MT001M03" (mã chi tiết loại cây MT001
  // đã tự mang số thứ tự AABBB, chỉ cần nối thêm CC = quy cách).
  const STAGE_CODES: { code: string; stage: "THANH_PHAM" | "MAU_ME"; qtyRange: [number, number] }[] = [
    { code: "M03", stage: "MAU_ME", qtyRange: [30, 80] },
    { code: "M05", stage: "MAU_ME", qtyRange: [20, 60] },
    { code: "T01", stage: "THANH_PHAM", qtyRange: [50, 150] },
    { code: "T05", stage: "THANH_PHAM", qtyRange: [20, 60] },
  ];

  const motherShelves = await prisma.shelf.findMany({
    where: { room: { type: "PHONG_MAU_ME" } },
  });
  const finishedShelves = await prisma.shelf.findMany({
    where: { room: { type: "PHONG_KHA_DUNG" } },
  });
  const allPlantTypes = await prisma.plantType.findMany({ orderBy: { code: "asc" } });

  function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const HISTORY_WEEKS = 10;

  for (const pt of allPlantTypes) {
    for (let i = 0; i < STAGE_CODES.length; i++) {
      const sc = STAGE_CODES[i];
      const code = `${pt.code}${sc.code}`;
      const quantity = randInt(sc.qtyRange[0], sc.qtyRange[1]);
      // Kệ mẫu mẹ (Phòng sáng) chỉ được chọn trong số kệ đã gán đúng loại cây pt — mỗi kệ chỉ xếp 1 mã cây.
      const shelves = sc.stage === "MAU_ME" ? motherShelves.filter((s) => s.plantTypeId === pt.id) : finishedShelves;
      const shelf = shelves[randInt(0, shelves.length - 1)];
      // Rải enteredAt xuyên suốt HISTORY_WEEKS tuần qua (xác định, không random) để báo cáo tồn kho có dữ liệu lịch sử
      const enteredAt = subDays(new Date(), (i * 5 + allPlantTypes.indexOf(pt) * 9) % (HISTORY_WEEKS * 7));

      await prisma.lot.upsert({
        where: { code },
        update: { enteredAt, shelfId: shelf?.id },
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
              createdById: kyThuat.id,
              assignedToId: staff.id,
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

            // Kệ Phòng sáng chỉ được chọn trong số kệ đã gán đúng loại cây pt (mỗi kệ chỉ xếp 1 mã cây).
            const ptMotherShelves = motherShelves.filter((s) => s.plantTypeId === pt.id);
            const motherLot = await prisma.lot.create({
              data: {
                code: `SEED-LOT-${weeksAgo}-${staffIdx}-${recIdx}-MM`,
                plantTypeId: pt.id,
                stage: "MAU_ME",
                stageCode: "SEED",
                shelfId: ptMotherShelves[(weeksAgo + staffIdx + recIdx) % ptMotherShelves.length]?.id,
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
