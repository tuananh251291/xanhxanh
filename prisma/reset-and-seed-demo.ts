import { PrismaClient } from "@prisma/client";
import type { InstructionEndReason, InstructionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { addDays, startOfWeek, subWeeks } from "date-fns";
import { generateInstructionCode, generateProductLotCode, generateTransferCode, generateMediumOrderCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoomShelf } from "@/lib/dark-room";
import { buildInstructionMediumNeeds, aggregateMediumOrderItems, getOrderWeekRange } from "@/lib/medium-orders";
import { planShelfAssignments } from "@/lib/shelf-assignment";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// Xoá toàn bộ dữ liệu GIAO DỊCH (chỉ định cấy, lô, nhật ký, bàn giao, đơn hàng, đơn môi trường, thông
// báo, checklist đã sinh) — GIỮ NGUYÊN: users, role_permissions, warehouses/rooms/shelves, plant
// types/categories, medium_types, system_configs, checklist_templates/thresholds.
async function resetTransactionalData() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      medium_order_days,
      medium_order_items,
      medium_orders,
      daily_record_items,
      daily_records,
      contamination_records,
      transfer_items,
      transfers,
      order_items,
      orders,
      planting_instruction_items,
      planting_instructions,
      lots,
      alerts,
      checklist_items
    CASCADE;
  `);
  console.log("🗑️  Đã xoá dữ liệu giao dịch (chỉ định, lô, nhật ký, bàn giao, đơn hàng, đơn MT, thông báo, checklist)");
}

// Tạo 1 đơn đặt hàng môi trường tự động cho chỉ định vừa tạo, đúng logic đang dùng ở
// POST /api/instructions (gộp theo tuần thực hiện nếu đã có đơn CHƯA xác nhận cùng tuần).
async function createMediumOrderForInstruction(instruction: {
  id: string;
  code: string;
  weekStart: Date | null;
  createdAt: Date;
  plannedT01Quantity: number | null;
  plannedT05Quantity: number | null;
}) {
  const items = await prisma.plantingInstructionItem.findMany({ where: { instructionId: instruction.id } });
  const needs = buildInstructionMediumNeeds(items, instruction.plannedT01Quantity ?? 0, instruction.plannedT05Quantity ?? 0);
  if (needs.length === 0) return;

  const targetWeekStart = instruction.weekStart ?? instruction.createdAt;
  const { weekStart, weekEnd, days } = getOrderWeekRange(targetWeekStart);

  const existingOrder = await prisma.mediumOrder.findFirst({
    where: { weekStart, confirmedAt: null },
    include: { instructions: { include: { items: true } } },
  });

  if (existingOrder) {
    await prisma.plantingInstruction.update({ where: { id: instruction.id }, data: { mediumOrderId: existingOrder.id } });
    const allNeeds = [
      ...existingOrder.instructions.map((inst) =>
        buildInstructionMediumNeeds(inst.items, inst.plannedT01Quantity ?? 0, inst.plannedT05Quantity ?? 0)
      ),
      needs,
    ];
    await prisma.mediumOrderItem.deleteMany({ where: { orderId: existingOrder.id } });
    await prisma.mediumOrder.update({ where: { id: existingOrder.id }, data: { items: { create: aggregateMediumOrderItems(allNeeds) } } });
  } else {
    const code = await generateMediumOrderCode();
    await prisma.mediumOrder.create({
      data: {
        code,
        weekStart,
        weekEnd,
        instructions: { connect: { id: instruction.id } },
        items: { create: needs },
        days: { create: days.map((date) => ({ date })) },
      },
    });
  }
}

type StaffShelf = { id: string; code: string; plantTypeId: string | null; warehouseId: string; warehouse: { code: string } };

async function pickStaffShelf(staffId: string): Promise<StaffShelf> {
  const shelf = await prisma.shelf.findFirst({
    where: { assignedStaffId: staffId, room: { type: "PHONG_MAU_ME" } },
    include: { warehouse: { select: { code: true } } },
    orderBy: { code: "asc" },
  });
  if (!shelf) throw new Error(`Không tìm thấy kệ Phòng mẫu mẹ đã gán cho NV ${staffId} — kiểm tra lại seed kệ`);
  return shelf;
}

// Tạo 1 lô mẫu mẹ nguồn (sẵn có trên kệ Phòng mẫu mẹ) + 1 chỉ định cấy tiêu thụ lô đó, theo đúng cấu
// trúc dữ liệu thật (PlantingInstructionItem, expectedMotherOutput/expectedFinishedOutput...).
async function createInstruction(params: {
  staffId: string;
  kyThuatId: string;
  status: InstructionStatus;
  weekStart: Date;
  createdAt: Date;
  endReason?: InstructionEndReason;
  handedOver: boolean;
  motherReceived: boolean;
  motherMediumTypeId: string;
  finishedMediumTypeId: string;
}) {
  const shelf = await pickStaffShelf(params.staffId);
  const sourceQty = 100;

  const sourceLot = await prisma.lot.create({
    data: {
      code: `${shelf.code}-SRC-${params.createdAt.getTime()}`,
      plantTypeId: shelf.plantTypeId!,
      stage: "MAU_ME",
      stageCode: "M03",
      shelfId: shelf.id,
      quantity: sourceQty,
      initialQuantity: sourceQty,
      status: "ACTIVE",
      enteredAt: subWeeks(params.createdAt, 2),
    },
  });

  const motherSampleRatio = 1.5;
  const rootingRatio = 2.0;
  const expectedMotherOutput = Math.floor(sourceQty * motherSampleRatio);
  const expectedFinishedOutput = Math.floor(sourceQty * rootingRatio);
  const plannedT01Quantity = Math.round(expectedFinishedOutput * 0.6);
  const plannedT05Quantity = expectedFinishedOutput - plannedT01Quantity;

  const code = await generateInstructionCode({ warehouseCode: shelf.warehouse.code, shelfCode: shelf.code, date: params.createdAt });

  const instruction = await prisma.plantingInstruction.create({
    data: {
      code,
      plantTypeId: shelf.plantTypeId!,
      createdById: params.kyThuatId,
      assignedToId: params.staffId,
      inputMotherQuantity: sourceQty,
      expectedMotherOutput,
      expectedFinishedOutput,
      plannedT01Quantity,
      plannedT05Quantity,
      weekStart: params.weekStart,
      status: params.status,
      createdAt: params.createdAt,
      handedOverAt: params.handedOver ? addDays(params.createdAt, 1) : null,
      motherReceivedAt: params.motherReceived ? addDays(params.createdAt, 1) : null,
      endReason: params.endReason,
      items: {
        create: [{
          shelfId: shelf.id,
          lotId: sourceLot.id,
          stageCode: "M03",
          quantity: sourceQty,
          motherSampleRatio,
          rootingRatio,
          expectedMotherOutput,
          expectedFinishedOutput,
          motherMediumTypeId: params.motherMediumTypeId,
          finishedMediumTypeId: params.finishedMediumTypeId,
        }],
      },
    },
  });

  await createMediumOrderForInstruction(instruction);
  return { instruction, warehouseId: shelf.warehouseId };
}

// Mô phỏng NV cấy mô nhập dữ liệu cấy cho 1 ngày cụ thể — tạo lô sản phẩm (mã theo generateProductLotCode)
// gắn thẳng vào kệ đại diện Phòng tối cá nhân, đúng logic đang chạy ở POST /api/daily-records.
async function seedDailyRecord(params: { instructionId: string; instructionCode: string; staffId: string; date: Date; personalShelfId: string }) {
  const m03 = 10 + Math.floor(Math.random() * 10);
  const t01 = 15 + Math.floor(Math.random() * 15);
  const productLotCode = generateProductLotCode(params.instructionCode, params.date);

  const motherLot = await prisma.lot.create({
    data: {
      code: productLotCode,
      plantTypeId: (await prisma.plantingInstruction.findUniqueOrThrow({ where: { id: params.instructionId } })).plantTypeId,
      stage: "MAU_ME",
      stageCode: "M03",
      quantity: m03,
      initialQuantity: m03,
      status: "ACTIVE",
      instructionId: params.instructionId,
      shelfId: params.personalShelfId,
      enteredAt: params.date,
    },
  });
  const finishedLot = await prisma.lot.create({
    data: {
      code: productLotCode,
      plantTypeId: motherLot.plantTypeId,
      stage: "THANH_PHAM",
      stageCode: "T01",
      quantity: t01,
      initialQuantity: t01,
      status: "ACTIVE",
      instructionId: params.instructionId,
      shelfId: params.personalShelfId,
      enteredAt: params.date,
    },
  });

  await prisma.dailyRecord.create({
    data: {
      instructionId: params.instructionId,
      staffId: params.staffId,
      recordDate: params.date,
      motherUsed: m03 + 5,
      motherChecked: m03 + 5,
      motherContaminated: 0,
      items: {
        create: [
          { lotId: motherLot.id, stage: "MAU_ME", quantityCreated: m03 },
          { lotId: finishedLot.id, stage: "THANH_PHAM", quantityCreated: t01 },
        ],
      },
    },
  });

  return [motherLot, finishedLot];
}

// Bàn giao toàn bộ lô đang ở Phòng tối cá nhân của 1 chỉ định sang Kho sáng — mô phỏng CAY_MO bấm
// "Bàn giao cho Kho mô" rồi KHO_MO xác nhận (planShelfAssignments), đúng logic thật ở
// PATCH /api/transfers/[id].
async function handOffToLightRoom(params: { instructionId: string; staffId: string; warehouseId: string }) {
  const lots = await prisma.lot.findMany({
    where: { instructionId: params.instructionId, status: "ACTIVE" },
    include: { plantType: { select: { code: true } }, instruction: { select: { assignedToId: true } } },
  });
  if (lots.length === 0) return;

  const code = await generateTransferCode();
  const transfer = await prisma.transfer.create({
    data: {
      code,
      fromWarehouseId: params.warehouseId,
      toWarehouseId: params.warehouseId,
      fromUserId: params.staffId,
      status: "PENDING",
      items: { create: lots.map((l) => ({ lotId: l.id, quantity: l.quantity })) },
    },
  });

  const placements = await planShelfAssignments(
    lots.map((l) => ({ lotId: l.id, lot: l })),
    params.warehouseId
  );
  for (const p of placements) {
    await prisma.lot.update({ where: { id: p.lotId }, data: { shelfId: p.shelfId, enteredAt: new Date() } });
  }
  await prisma.transfer.update({ where: { id: transfer.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
}

// Rải thêm cây nền lên các kệ Phòng mẫu mẹ + Phòng ra rễ (độc lập với 5 chỉ định demo) để Kho sáng ở
// CẢ 2 kho sản xuất đều có cây ngay cả ở những kệ không liên quan tới các chỉ định vừa tạo.
async function seedBaselineLightRoomLots() {
  const plantTypes = await prisma.plantType.findMany({ orderBy: { code: "asc" } });
  const motherShelves = await prisma.shelf.findMany({ where: { room: { type: "PHONG_MAU_ME" } } });
  const finishedShelves = await prisma.shelf.findMany({ where: { room: { type: "PHONG_RA_RE" } } });

  let count = 0;
  for (const pt of plantTypes) {
    const ownShelves = motherShelves.filter((s) => s.plantTypeId === pt.id);
    if (ownShelves.length === 0) continue;
    const shelf = ownShelves[count % ownShelves.length];
    const qty = 30 + Math.floor(Math.random() * 40);
    await prisma.lot.create({
      data: {
        code: `${pt.code}-BASE-${count}`,
        plantTypeId: pt.id,
        stage: "MAU_ME",
        stageCode: count % 2 === 0 ? "M03" : "M05",
        shelfId: shelf.id,
        quantity: qty,
        initialQuantity: qty,
        status: "ACTIVE",
        enteredAt: subWeeks(new Date(), 1 + (count % 3)),
      },
    });

    const rrShelf = finishedShelves[count % finishedShelves.length];
    const rrQty = 40 + Math.floor(Math.random() * 60);
    await prisma.lot.create({
      data: {
        code: `${pt.code}-BASE-TP-${count}`,
        plantTypeId: pt.id,
        stage: "THANH_PHAM",
        stageCode: count % 2 === 0 ? "T01" : "T05",
        shelfId: rrShelf.id,
        quantity: rrQty,
        initialQuantity: rrQty,
        status: "ACTIVE",
        enteredAt: subWeeks(new Date(), 1 + (count % 3)),
      },
    });
    count += 1;
  }
  console.log(`✅ Đã rải cây nền lên Phòng mẫu mẹ + Phòng ra rễ (${count} loại cây)`);
}

async function main() {
  await resetTransactionalData();
  await seedBaselineLightRoomLots();

  const kyThuat = await prisma.user.findFirstOrThrow({ where: { role: "KY_THUAT" } });

  // Chỉ chọn NV cấy mô ĐÃ có kệ Phòng mẫu mẹ được gán sẵn (assignedStaffId) — hệ thống hiện có nhiều
  // NV cấy mô demo hơn số kệ đã cấu hình, nên không thể lấy tuỳ ý theo alphabet mã NV.
  const assignedShelves = await prisma.shelf.findMany({
    where: { room: { type: "PHONG_MAU_ME" }, assignedStaffId: { not: null } },
    select: { assignedStaffId: true },
    distinct: ["assignedStaffId"],
  });
  const staffIdsWithShelf = assignedShelves.map((s) => s.assignedStaffId!);
  const caymoStaff = await prisma.user.findMany({
    where: { role: "CAY_MO", id: { in: staffIdsWithShelf } },
    orderBy: { code: "asc" },
  });
  if (caymoStaff.length < 3) throw new Error("Cần ít nhất 3 NV cấy mô (CAY_MO) đã có kệ Phòng mẫu mẹ được gán để tạo đủ dữ liệu demo");
  const mediumTypes = await prisma.mediumType.findMany({ orderBy: { code: "asc" } });
  const motherMediumTypeId = mediumTypes[0].id;
  const finishedMediumTypeId = mediumTypes[1]?.id ?? mediumTypes[0].id;

  const [caymo1, caymo2, caymo3] = caymoStaff;
  const today = new Date();
  const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(thisWeekStart, 1);
  const nextWeekStart = addDays(thisWeekStart, 7);

  // 1) ENDED — tuần trước, caymo1 đã cấy đủ 6 ngày, bàn giao + Kho mô xác nhận xong (kho sáng có cây từ đây)
  {
    const { instruction, warehouseId } = await createInstruction({
      staffId: caymo1.id,
      kyThuatId: kyThuat.id,
      status: "ENDED",
      weekStart: lastWeekStart,
      createdAt: addDays(lastWeekStart, -4), // Thứ 5 tuần trước đó
      endReason: "TIME_UP",
      handedOver: true,
      motherReceived: true,
      motherMediumTypeId,
      finishedMediumTypeId,
    });
    for (let d = 0; d < 6; d++) {
      await seedDailyRecord({
        instructionId: instruction.id,
        instructionCode: instruction.code,
        staffId: caymo1.id,
        date: addDays(lastWeekStart, d),
        personalShelfId: (await getOrCreatePersonalDarkRoomShelf(caymo1.id, warehouseId)).id,
      });
    }
    await handOffToLightRoom({ instructionId: instruction.id, staffId: caymo1.id, warehouseId });
    console.log(`✅ [ENDED] ${instruction.code} — ${caymo1.name} — đã bàn giao + Kho mô xác nhận (kho sáng có cây)`);
  }

  // 2) ACTIVE — tuần này, caymo1 mới cấy được 2/6 ngày, còn dở dang trong phòng tối cá nhân
  {
    const { instruction, warehouseId } = await createInstruction({
      staffId: caymo1.id,
      kyThuatId: kyThuat.id,
      status: "ACTIVE",
      weekStart: thisWeekStart,
      createdAt: addDays(thisWeekStart, -4),
      handedOver: true,
      motherReceived: true,
      motherMediumTypeId,
      finishedMediumTypeId,
    });
    const personalShelf = await getOrCreatePersonalDarkRoomShelf(caymo1.id, warehouseId);
    for (let d = 0; d < 2; d++) {
      await seedDailyRecord({
        instructionId: instruction.id,
        instructionCode: instruction.code,
        staffId: caymo1.id,
        date: addDays(thisWeekStart, d),
        personalShelfId: personalShelf.id,
      });
    }
    console.log(`✅ [ACTIVE] ${instruction.code} — ${caymo1.name} — đã cấy 2/6 ngày, còn ở phòng tối cá nhân`);
  }

  // 3) COMPLETED — caymo2, tuần trước, đánh dấu hoàn thành thủ công
  {
    const { instruction } = await createInstruction({
      staffId: caymo2.id,
      kyThuatId: kyThuat.id,
      status: "COMPLETED",
      weekStart: lastWeekStart,
      createdAt: addDays(lastWeekStart, -4),
      handedOver: true,
      motherReceived: true,
      motherMediumTypeId,
      finishedMediumTypeId,
    });
    console.log(`✅ [COMPLETED] ${instruction.code} — ${caymo2.name}`);
  }

  // 4) CANCELLED — caymo3, tuần này, huỷ trước khi bắt đầu cấy
  {
    const { instruction } = await createInstruction({
      staffId: caymo3.id,
      kyThuatId: kyThuat.id,
      status: "CANCELLED",
      weekStart: thisWeekStart,
      createdAt: addDays(thisWeekStart, -3),
      handedOver: false,
      motherReceived: false,
      motherMediumTypeId,
      finishedMediumTypeId,
    });
    console.log(`✅ [CANCELLED] ${instruction.code} — ${caymo3.name}`);
  }

  // 5) DRAFT — caymo3, cho tuần sau, vừa tạo xong chưa bàn giao
  {
    const { instruction } = await createInstruction({
      staffId: caymo3.id,
      kyThuatId: kyThuat.id,
      status: "DRAFT",
      weekStart: nextWeekStart,
      createdAt: today,
      handedOver: false,
      motherReceived: false,
      motherMediumTypeId,
      finishedMediumTypeId,
    });
    console.log(`✅ [DRAFT] ${instruction.code} — ${caymo3.name}`);
  }

  console.log("\n🎉 Reset + seed demo hoàn tất!");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
