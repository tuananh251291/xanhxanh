import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateProductLotCode } from "@/lib/codes";
import { createAlert, getSystemConfig } from "@/lib/inventory";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { addToContaminationRoom } from "@/lib/contamination-room";
import { z } from "zod";
import { addDays, addWeeks, startOfDay, endOfDay, startOfWeek, endOfWeek, isSameDay } from "date-fns";
import { canManageDailyRecords, isAdminRole } from "@/types";

// "Phát sinh cây cần phân loại" — chỉ NV cấy mô tích chọn khi mã cây của chỉ định thuộc 1 nhóm biến thể
// (PlantType.variantGroupId) có >1 thành viên (xem /plant-types). Truyền kèm breakdown số lượng theo
// từng mã trong nhóm cho ĐÚNG cột đang tách (m05/t05/t01) — tổng breakdown phải khớp con số đã nhập ở
// cột gốc tương ứng (m05/t05/t01), validate ở dưới. Không truyền (hoặc mảng rỗng) = giữ hành vi cũ,
// toàn bộ số lượng cột đó tính là đúng mã cây của chỉ định.
const variantBreakdownSchema = z.array(z.object({ plantTypeId: z.string(), quantity: z.number().int().min(0) })).optional();

const schema = z.object({
  instructionId: z.string(),
  motherChecked: z.number().int().min(0),
  motherContaminatedM05: z.number().int().min(0),
  motherUsed: z.number().int().min(0),
  m05: z.number().int().min(0),
  t05: z.number().int().min(0),
  t01: z.number().int().min(0),
  m05Variants: variantBreakdownSchema,
  t05Variants: variantBreakdownSchema,
  t01Variants: variantBreakdownSchema,
  notes: z.string().optional(),
  // Chỉ Admin/Admin cấp cao/KHO_MO (cùng kho) mới truyền — bù dữ liệu cho 1 ngày cụ thể trong tuần mà
  // NV cấy mô bỏ sót (xem nhánh canActOnBehalf bên dưới). NV cấy mô tự nhập luôn bỏ qua field này, luôn
  // dùng đúng "hôm nay".
  date: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "CAY_MO" && role !== "KHO_MO" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { instructionId, motherChecked, motherContaminatedM05, motherUsed, m05, t05, t01, m05Variants, t05Variants, t01Variants, notes } = parsed.data;

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id: instructionId },
    include: {
      plantType: { include: { variantGroup: { include: { members: true } } } },
      assignedTo: { select: { name: true } },
      items: { include: { shelf: { select: { warehouseId: true, warehouse: { select: { code: true } } } } } },
    },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });

  // Lô sản xuất ra tự động chuyển vào Phòng tối CÁ NHÂN của NV cấy mô ngay khi nhập dữ liệu — không
  // cần đợi bàn giao mới có chỗ. Suy ra đúng kho sản xuất từ giàn kệ nguồn của chỉ định — cần biết sớm
  // để còn xét quyền KHO_MO (chỉ được thao tác đúng kho mình làm việc) ngay dưới đây.
  const warehouseId = instruction.items[0]?.shelf?.warehouseId;
  const warehouseCode = instruction.items[0]?.shelf?.warehouse.code;
  if (!warehouseId || !warehouseCode) {
    return NextResponse.json({ message: "Không xác định được kho sản xuất của chỉ định" }, { status: 400 });
  }

  const canActOnBehalf = canManageDailyRecords(role, session!.user.workplaceWarehouseId, warehouseId);
  if (role === "CAY_MO") {
    if (instruction.assignedToId !== session!.user.id) {
      return NextResponse.json({ message: "Không phải chỉ định của bạn" }, { status: 403 });
    }
  } else if (!canActOnBehalf) {
    return NextResponse.json({ message: "Không có quyền — chỉ được cập nhật nhật ký của NV cùng kho sản xuất bạn làm việc" }, { status: 403 });
  }
  // Admin/KHO_MO bù dữ liệu THAY cho đúng NV đã được gán — chỉ định chưa gán ai thì không biết gán nhật ký cho ai.
  if (canActOnBehalf && !instruction.assignedToId) {
    return NextResponse.json({ message: "Chỉ định chưa gán NV cấy mô" }, { status: 400 });
  }
  // NV cấy mô phải bấm "Xác nhận" đã nhận mẫu mẹ (confirmMotherReceived) trước khi có dữ liệu cấy nào
  // được ghi nhận cho chỉ định này — kể cả Admin/KHO_MO bù hộ cũng không được bỏ qua bước này, vì về mặt
  // vật lý NV chưa xác nhận nghĩa là chưa chắc chắn đã thực sự cầm mẫu mẹ để cấy.
  if (!instruction.motherReceivedAt) {
    return NextResponse.json({ message: "Chỉ định chưa được NV cấy mô xác nhận nhận mẫu mẹ — không thể nhập dữ liệu cấy" }, { status: 400 });
  }
  const staffId = canActOnBehalf ? instruction.assignedToId! : session!.user.id;

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  if (!instruction.weekStart || instruction.weekStart < weekStart || instruction.weekStart > weekEnd) {
    return NextResponse.json({ message: "Chỉ định này không thuộc tuần thực tế" }, { status: 400 });
  }

  // Ngày ghi nhận thật sự của bản ghi — NV cấy mô luôn là "hôm nay". Admin/KHO_MO bù dữ liệu được chọn
  // đúng 1 ngày Thứ 2 - Chủ nhật của TUẦN HIỆN TẠI (đã đảm bảo instruction.weekStart == tuần hiện tại ở
  // trên), không cho chọn ngày trong tương lai hay ngoài tuần chỉ định.
  let targetDate = today;
  if (canActOnBehalf && parsed.data.date) {
    const requested = new Date(parsed.data.date);
    if (Number.isNaN(requested.getTime()) || requested < instruction.weekStart || requested > addDays(instruction.weekStart, 6) || requested > today) {
      return NextResponse.json({ message: "Ngày không hợp lệ — chỉ chọn được trong tuần chỉ định và không sau hôm nay" }, { status: 400 });
    }
    targetDate = requested;
  }

  // Mỗi ngày chỉ được nhập 1 lần — đã điền xong (có bản ghi của đúng ngày đó) thì không cho nhập/sửa lại
  // qua đường tạo mới này (sửa lại dữ liệu ngày đã có phải qua PATCH /api/daily-records/[id]).
  const existingForDate = await prisma.dailyRecord.findFirst({
    where: {
      instructionId,
      staffId,
      recordDate: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) },
    },
  });
  if (existingForDate) {
    return NextResponse.json({ message: "Đã có dữ liệu cho ngày này, không thể nhập lại" }, { status: 409 });
  }

  // Tổng "MM đã kiểm tra" lũy kế cả tuần (Thứ 2 - Chủ nhật, tức toàn bộ DailyRecord của chỉ định vì 1
  // chỉ định = đúng 1 tuần) không được vượt quá số mẫu mẹ được cấp cho chỉ định (inputMotherQuantity —
  // đã là tổng cộng dồn từ mọi dòng quy cách nguồn M05, xem PlantingInstruction) — chặn cứng, không
  // cho lưu nếu vượt.
  const checkedAgg = await prisma.dailyRecord.aggregate({
    where: { instructionId },
    _sum: { motherChecked: true },
  });
  const cumulativeChecked = (checkedAgg._sum.motherChecked ?? 0) + motherChecked;
  if (cumulativeChecked > instruction.inputMotherQuantity) {
    return NextResponse.json({
      message: `Tổng MM đã kiểm tra (${cumulativeChecked} cụm) vượt quá số mẫu mẹ được cấp cho chỉ định (${instruction.inputMotherQuantity} cụm)`,
    }, { status: 400 });
  }

  // "Phát sinh cây cần phân loại" — NV cấy mô có thể tách số lượng M05/T05/T01 theo nhiều mã cây khác
  // nhau nếu mã cây của chỉ định thuộc 1 nhóm biến thể (VD MT047 tự nhân ra cả MT047/MT005/MT042, xem
  // PlantType.variantGroupId). Chỉ cho chọn mã THUỘC ĐÚNG nhóm biến thể của chỉ định, và tổng breakdown
  // mỗi cột phải khớp CHÍNH XÁC số đã nhập ở cột gốc tương ứng — không có breakdown thì giữ nguyên hành
  // vi cũ (toàn bộ số lượng tính là đúng mã cây của chỉ định).
  const variantMembers = instruction.plantType.variantGroup?.members ?? [];
  const variantMemberIds = new Set(variantMembers.map((m) => m.id));

  function validateVariantBreakdown(
    total: number,
    breakdown: { plantTypeId: string; quantity: number }[] | undefined,
    label: string
  ): string | null {
    if (!breakdown || breakdown.length === 0) return null;
    if (variantMemberIds.size === 0) return `Chỉ định này không thuộc nhóm biến thể nào — không thể phân loại ${label}`;
    const sum = breakdown.reduce((s, b) => s + b.quantity, 0);
    if (sum !== total) return `Tổng số lượng phân loại ${label} (${sum}) không khớp số đã nhập ở cột gốc (${total})`;
    if (breakdown.some((b) => !variantMemberIds.has(b.plantTypeId))) {
      return `Có mã cây phân loại ${label} không thuộc nhóm biến thể của chỉ định`;
    }
    return null;
  }

  const breakdownError =
    validateVariantBreakdown(m05, m05Variants, "M05") ??
    validateVariantBreakdown(t05, t05Variants, "T05") ??
    validateVariantBreakdown(t01, t01Variants, "T01");
  if (breakdownError) {
    return NextResponse.json({ message: breakdownError }, { status: 400 });
  }

  // Luôn dùng đúng Phòng tối cá nhân của NV đứng tên bản ghi (staffId) — kể cả khi Admin/KHO_MO là người
  // bấm lưu (bù dữ liệu hộ), vì đây là "không gian vật lý" của NV cấy mô, không phải của người thao tác.
  const personalRoom = await getOrCreatePersonalDarkRoom(staffId, warehouseId);

  // Có breakdown thì tạo 1 dòng/mã cây (bỏ qua mã có số lượng 0) — không thì 1 dòng duy nhất dùng đúng
  // mã cây của chỉ định, y hệt hành vi cũ.
  const primaryPlantTypeId = instruction.plantTypeId;
  function resolveStageItems(
    stage: "MAU_ME" | "THANH_PHAM",
    stageCode: "M05" | "T05" | "T01",
    total: number,
    breakdown: { plantTypeId: string; quantity: number }[] | undefined
  ) {
    if (breakdown && breakdown.length > 0) {
      return breakdown.filter((b) => b.quantity > 0).map((b) => ({ stage, stageCode, plantTypeId: b.plantTypeId, quantityCreated: b.quantity }));
    }
    return total > 0 ? [{ stage, stageCode, plantTypeId: primaryPlantTypeId, quantityCreated: total }] : [];
  }

  const items = [
    ...resolveStageItems("MAU_ME", "M05", m05, m05Variants),
    ...resolveStageItems("THANH_PHAM", "T05", t05, t05Variants),
    ...resolveStageItems("THANH_PHAM", "T01", t01, t01Variants),
  ];

  const recordItems = [];
  const lotsCreated = [];

  // Lô sản phẩm: mỗi ngày trong tuần chỉ định luôn tạo 1 lô riêng (mã = mã chỉ định + 1 ký tự 2-8 ứng
  // với Thứ 2 - Chủ nhật của ngày nhập) — không gộp nhiều ngày vào 1 lô như trước. "Mỗi ngày chỉ được
  // nhập 1 lần" (existingForDate ở trên) nên không lo trùng mã trong cùng 1 chỉ định. Dùng targetDate
  // (không phải "hôm nay" thao tác) để mã lô/hạn cấy chuyển đúng theo ngày đang bù dữ liệu. Lô đúng mã
  // cây chỉ định giữ nguyên mã lô này; lô biến thể (mã cây khác) thêm hậu tố mã cây để không đụng ràng
  // buộc duy nhất (code, stageCode) khi cùng ngày/cùng stage có nhiều mã cây.
  const productLotCode = generateProductLotCode(instruction.code, targetDate);
  const plantTypeById = new Map<string, { code: string; transferWaitWeeks: number; rootingWeeks: number }>([
    [instruction.plantTypeId, instruction.plantType],
    ...variantMembers.map((m) => [m.id, m] as const),
  ]);

  for (const item of items) {
    const itemPlantType = plantTypeById.get(item.plantTypeId)!;
    const expectedMoveAt =
      item.stage === "MAU_ME"
        ? addWeeks(targetDate, itemPlantType.transferWaitWeeks)
        : addWeeks(targetDate, itemPlantType.rootingWeeks);
    const isPrimary = item.plantTypeId === instruction.plantTypeId;
    const lot = await prisma.lot.create({
      data: {
        code: isPrimary ? productLotCode : `${productLotCode}-${itemPlantType.code}`,
        plantTypeId: item.plantTypeId,
        stage: item.stage,
        stageCode: item.stageCode,
        quantity: item.quantityCreated,
        initialQuantity: item.quantityCreated,
        instructionId,
        roomId: personalRoom.id,
        enteredAt: targetDate,
        expectedMoveAt,
      },
    });
    recordItems.push({ lotId: lot.id, stage: item.stage, quantityCreated: item.quantityCreated });
    lotsCreated.push(lot);
  }

  // Tạo daily record — recordDate đúng ngày đang ghi nhận (hôm nay với NV cấy mô, hoặc ngày Admin chọn
  // bù trong tuần hiện tại).
  const record = await prisma.dailyRecord.create({
    data: {
      instructionId,
      staffId,
      recordDate: targetDate,
      motherUsed,
      motherChecked,
      motherContaminatedM05,
      notes,
      items: { create: recordItems },
    },
    include: {
      items: { include: { lot: true } },
    },
  });

  // Mẫu mẹ nhiễm phát hiện lúc kiểm tra hằng ngày → cộng dồn vào Phòng nhiễm của đúng kho.
  await addToContaminationRoom(prisma, {
    warehouseId,
    warehouseCode,
    plantTypeId: instruction.plantTypeId,
    plantTypeCode: instruction.plantType.code,
    stage: "MAU_ME",
    stageCode: "M05",
    quantity: motherContaminatedM05,
  });

  // Tỉ lệ nhiễm mẫu mẹ sau ủ sáng — tổng mẫu mẹ nhiễm cộng dồn mọi ngày của chỉ định này so với tổng
  // mẫu mẹ được cấp (inputMotherQuantity), kiểm tra lại ngay mỗi lần lưu nhật ký — vượt ngưỡng Admin cấp
  // cao cài đặt (mother_contamination_alert_pct, xem Cài đặt) thì báo cho CẢ KHO_MO (biết sớm, trước cả
  // khi có phiếu bàn giao thật, để chủ động xử lý khi nhận) LẪN đúng NV kỹ thuật đã tạo chỉ định này (biết
  // sớm để theo dõi/điều chỉnh chỉ định nếu cần) — 2 alert riêng, dedupe riêng theo từng người nhận (không
  // dùng chung 1 query dedupe, vì targetRole/userId khác nhau — nếu chỉ chặn theo type+relatedId+status
  // thì bên nào tạo alert trước sẽ chặn luôn alert của bên còn lại).
  const motherContaminationPct = parseFloat(await getSystemConfig("mother_contamination_alert_pct", "10")) || 10;
  const contaminatedAgg = await prisma.dailyRecord.aggregate({
    where: { instructionId },
    _sum: { motherContaminatedM05: true },
  });
  const totalContaminated = contaminatedAgg._sum.motherContaminatedM05 ?? 0;
  const motherContaminationRate = instruction.inputMotherQuantity > 0 ? (totalContaminated / instruction.inputMotherQuantity) * 100 : 0;
  if (motherContaminationRate > motherContaminationPct) {
    const contaminationMessage = `Chỉ định ${instruction.code}: mẫu mẹ nhiễm ${totalContaminated}/${instruction.inputMotherQuantity} (${Math.round(motherContaminationRate)}%) — vượt ngưỡng ${motherContaminationPct}%`;

    // Chặn spam: mỗi chỉ định chỉ giữ tối đa 1 alert CHƯA ĐỌC loại này/người nhận tại 1 thời điểm — nếu
    // tỉ lệ nhiễm vẫn vượt ngưỡng ở lần lưu nhật ký tiếp theo (VD ngày sau) mà chưa kịp đọc alert cũ,
    // không tạo thêm bản ghi trùng; đọc/xử lý xong (đổi status khỏi UNREAD) thì lần lệch tiếp theo mới
    // tạo alert mới.
    const existingKhoMoAlert = await prisma.alert.findFirst({
      where: { type: "MOTHER_CONTAMINATION_HIGH", relatedId: instructionId, targetRole: "KHO_MO", status: "UNREAD" },
    });
    if (!existingKhoMoAlert) {
      await createAlert({
        type: "MOTHER_CONTAMINATION_HIGH",
        title: "Tỉ lệ nhiễm mẫu mẹ sau ủ sáng vượt ngưỡng",
        message: contaminationMessage,
        targetRole: "KHO_MO",
        relatedId: instructionId,
        relatedType: "PlantingInstruction",
      });
    }

    const existingKyThuatAlert = await prisma.alert.findFirst({
      where: { type: "MOTHER_CONTAMINATION_HIGH", relatedId: instructionId, userId: instruction.createdById, status: "UNREAD" },
    });
    if (!existingKyThuatAlert) {
      await createAlert({
        type: "MOTHER_CONTAMINATION_HIGH",
        title: "Tỉ lệ nhiễm mẫu mẹ sau ủ sáng vượt ngưỡng",
        message: contaminationMessage,
        userId: instruction.createdById,
        relatedId: instructionId,
        relatedType: "PlantingInstruction",
      });
    }
  }

  // Tổng "MM sử dụng" lũy kế cả chỉ định — dùng chung cho cả cảnh báo lệch chỉ định (bên dưới) lẫn kiểm
  // tra tự động kết thúc chỉ định (bên dưới nữa), tránh truy vấn 2 lần.
  const motherUsedAgg = await prisma.dailyRecord.aggregate({
    where: { instructionId },
    _sum: { motherUsed: true },
  });
  const totalMotherUsed = motherUsedAgg._sum.motherUsed ?? 0;

  // Nghi ngờ cấy sai chỉ định khi CHỈ CẦN 1 TRONG 2 tỉ lệ thực tế (lũy kế cả chỉ định) thấp hơn ngưỡng %
  // Admin cấp cao cấu hình (mục Cài đặt: "Tỉ lệ nhân MM cần đạt" / "Tỉ lệ ra thành phẩm cần đạt") so với
  // tỉ lệ mục tiêu của chính chỉ định này (suy từ motherSampleRatio/rootingRatio KY_THUAT nhập lúc tạo
  // chỉ định):
  // - Tỉ lệ nhân MM = số cụm mẫu mẹ thành phẩm (M05) / số mẫu mẹ đã sử dụng.
  // - Tỉ lệ ra thành phẩm = số cây ra rễ thành phẩm (T05+T01) / số mẫu mẹ đã sử dụng.
  const motherRatioTargetPct = parseFloat(await getSystemConfig("mother_ratio_target_pct", "80")) || 80;
  const finishedRatioTargetPct = parseFloat(await getSystemConfig("finished_ratio_target_pct", "80")) || 80;

  // expectedMotherOutput đã tính thẳng theo cụm — không cần quy đổi thêm.
  const targetMotherOutputClusters = instruction.items
    .filter((i) => i.stageCode === "M05")
    .reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0);
  const targetMotherRatio = instruction.inputMotherQuantity > 0 ? targetMotherOutputClusters / instruction.inputMotherQuantity : 0;
  const targetFinishedRatio = instruction.inputMotherQuantity > 0 ? (instruction.expectedFinishedOutput ?? 0) / instruction.inputMotherQuantity : 0;

  const producedItems = await prisma.dailyRecordItem.findMany({
    where: { dailyRecord: { instructionId } },
    select: { stage: true, quantityCreated: true },
  });
  let actualMotherOutputClusters = 0;
  let actualFinishedOutput = 0;
  for (const i of producedItems) {
    // quantityCreated đã tính thẳng theo cụm (M05) — không cần quy đổi thêm.
    if (i.stage === "MAU_ME") actualMotherOutputClusters += i.quantityCreated;
    else actualFinishedOutput += i.quantityCreated;
  }
  const actualMotherRatio = totalMotherUsed > 0 ? actualMotherOutputClusters / totalMotherUsed : 0;
  const actualFinishedRatio = totalMotherUsed > 0 ? actualFinishedOutput / totalMotherUsed : 0;
  const motherRatioPct = targetMotherRatio > 0 ? (actualMotherRatio / targetMotherRatio) * 100 : null;
  const finishedRatioPct = targetFinishedRatio > 0 ? (actualFinishedRatio / targetFinishedRatio) * 100 : null;

  // Chỉ định có thể chỉ được KY_THUAT nhập 1 trong 2 tỉ lệ (VD để trống "Tỉ lệ ra TP" vì chưa xác định) —
  // tỉ lệ nào KHÔNG có mục tiêu (Pct null) thì bỏ qua, không tính vào điều kiện báo. Chỉ cần 1 tỉ lệ CÓ
  // mục tiêu và thấp hơn ngưỡng là báo ngay, không cần tỉ lệ còn lại (nếu có) cũng phải thấp.
  const motherLow = motherRatioPct !== null && motherRatioPct < motherRatioTargetPct;
  const finishedLow = finishedRatioPct !== null && finishedRatioPct < finishedRatioTargetPct;

  let alert = false;
  if (totalMotherUsed > 0 && (motherLow || finishedLow)) {
    alert = true;
    // Chặn spam: mỗi chỉ định (1 chỉ định = đúng 1 tuần) chỉ TẠO TỐI ĐA 1 alert loại này trong suốt vòng
    // đời của nó — không lọc theo status (khác MOTHER_CONTAMINATION_HIGH ở trên, vốn cho phép báo lại sau
    // khi đã đọc). Lý do: alert này bắt buộc chọn nguyên nhân mới coi là RESOLVED (xem PATCH
    // /api/alerts), còn "Đã xem" ở trang Thông báo chỉ chuyển READ (không chọn nguyên nhân) — nếu chặn
    // trùng theo status: "UNREAD" thì CẢ 2 cách (xử lý thật SỰ lẫn chỉ bấm "Đã xem" cho có) đều làm mất
    // dấu "đã từng báo", khiến ngày hôm sau lệch tiếp lại tạo thêm alert mới — đúng thứ đang muốn tránh.
    // Chỉ cần đã từng tồn tại 1 alert cho chỉ định này (dù đã xử lý/đã đọc/chưa đọc) thì không tạo thêm.
    const existingDeviationAlert = await prisma.alert.findFirst({
      where: { type: "OUTPUT_DEVIATION", relatedId: instructionId },
    });
    if (!existingDeviationAlert) {
      // Gắn userId = đúng NV kỹ thuật đã TẠO chỉ định này (không broadcast targetRole cho cả phòng) — chỉ
      // người tạo mới thấy alert này ở trang Thông báo/Kiểm tra tình trạng cấy và mới đủ quyền PATCH
      // /api/alerts để chọn nguyên nhân xử lý (route đó tự chặn nếu alert.userId khác session hiện tại,
      // xem src/app/api/alerts/route.ts) — tránh NV kỹ thuật khác âm thầm xử lý hộ, làm sai điểm đánh giá cá
      // nhân (checkPercent) của đúng người phụ trách chỉ định.
      // Hiện dạng hệ số thực tế/theo chỉ định (VD 1,2 / 1,8) — đúng đơn vị KY_THUAT đã gõ lúc tạo chỉ định
      // (motherSampleRatio/rootingRatio) — kèm % đạt được so với chỉ định (Pct) để dễ hình dung mức độ
      // lệch. Mỗi dòng cách nhau bằng "\n" — trang hiển thị alert.message cần "whitespace-pre-line" mới
      // xuống dòng đúng (xem alerts/page.tsx, dashboard/page.tsx, planting-check-board.tsx). Chỉ liệt kê
      // tỉ lệ nào THỰC SỰ có mục tiêu (Pct !== null) — chỉ định thiếu 1 trong 2 thì message cũng chỉ nói
      // đúng 1 tỉ lệ.
      const fmtRatio = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
      const fmtPct = (n: number) => n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const deviationLines: string[] = [];
      if (motherRatioPct !== null) {
        deviationLines.push(
          `Tỉ lệ nhân MM thực tế: ${fmtRatio(actualMotherRatio)}`,
          `Tỉ lệ nhân MM theo chỉ định: ${fmtRatio(targetMotherRatio)}`,
          `Đạt: ${fmtPct(motherRatioPct)}%`
        );
      }
      if (finishedRatioPct !== null) {
        deviationLines.push(
          `Tỉ lệ ra thành phẩm thực tế: ${fmtRatio(actualFinishedRatio)}`,
          `Tỉ lệ ra thành phẩm theo chỉ định: ${fmtRatio(targetFinishedRatio)}`,
          `Đạt: ${fmtPct(finishedRatioPct)}%`
        );
      }
      await createAlert({
        type: "OUTPUT_DEVIATION",
        title: "Cấy lệch tiến độ so với chỉ định",
        message: `Chỉ định ${instruction.code} — NV thực hiện: ${instruction.assignedTo?.name ?? "—"}\n${deviationLines.join("\n")}`,
        userId: instruction.createdById,
        relatedId: instructionId,
        relatedType: "PlantingInstruction",
      });
    }
  }

  // Tự động chuyển chỉ định sang "Kết thúc" ngay khi thao tác Lưu, nếu xảy ra 1 trong 2 trường hợp:
  // 1. Đã kiểm tra hết mẫu mẹ được cấp (tổng "MM đã kiểm tra" — cumulativeChecked tính ở trên — >=
  //    inputMotherQuantity, KHÔNG dùng tổng "MM sử dụng") — vì "MM đã kiểm tra = MM nhiễm + MM sử dụng",
  //    hễ kiểm tra hết là không còn gì để cấy tiếp (dùng hay nhiễm), không còn dư gì để bàn giao. Trước
  //    đây so bằng "MM sử dụng" khiến chỉ định có mẫu mẹ nhiễm KHÔNG BAO GIỜ tự kết thúc được qua trường
  //    hợp này (nhiễm không tính vào "sử dụng" nên "sử dụng" không bao giờ chạm tới inputMotherQuantity dù
  //    đã kiểm tra hết 100%) — kẹt "Đang thực hiện" tới tận cuối tuần mới đóng qua trường hợp 2.
  // 2. Hôm nay là Chủ nhật của tuần chỉ định — hết tuần thật sự, không còn ngày nào khác để làm tiếp.
  //    KHÔNG tự kết thúc vào Thứ 7 nữa (khác trước đây) — Thứ 7 là ngày làm việc chính thức nhưng Chủ
  //    nhật có thể làm thêm hoặc không, nên client hỏi NV ngay sau khi lưu Thứ 7 "có làm thêm Chủ nhật
  //    không" (xem daily-record-simple-form.tsx / (dashboard)/daily-record/page.tsx) — chọn "Không" mới
  //    gọi endEarly kết thúc sớm, chọn "Có" thì chỉ định vẫn ACTIVE qua Chủ nhật. Chỉ kiểm tra tại đúng
  //    thời điểm Lưu này (không có cơ chế quét nền/cron), nên nếu NV không lưu vào đúng Chủ nhật thì chỉ
  //    định sẽ không tự kết thúc qua đây (vẫn kết thúc được qua endEarly hoặc ensureInstructionsEnded khi
  //    sang tuần mới).
  let ended = false;
  let endReason: "MOTHER_USED_UP" | "TIME_UP" | null = null;
  if (instruction.status !== "ENDED") {
    if (cumulativeChecked >= instruction.inputMotherQuantity) {
      endReason = "MOTHER_USED_UP";
    } else if (isSameDay(today, weekEnd)) {
      endReason = "TIME_UP";
    }

    if (endReason) {
      await prisma.plantingInstruction.update({
        where: { id: instructionId },
        data: { status: "ENDED", endReason },
      });
      ended = true;
    }
  }

  return NextResponse.json(
    { record, lotsCreated, alert, actualMotherRatio, targetMotherRatio, actualFinishedRatio, targetFinishedRatio, ended, endReason },
    { status: 201 }
  );
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const instructionId = searchParams.get("instructionId");
  const where: Record<string, unknown> = {};
  if (session.user.role === "CAY_MO") where.staffId = session.user.id;
  if (instructionId) where.instructionId = instructionId;

  const records = await prisma.dailyRecord.findMany({
    where,
    include: {
      staff: { select: { name: true } },
      instruction: { select: { code: true, plantType: { select: { name: true } } } },
      items: { include: { lot: { select: { code: true, stage: true, stageCode: true } } } },
    },
    orderBy: { recordDate: "desc" },
    take: 50,
  });
  return NextResponse.json(records);
}
