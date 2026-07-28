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

const schema = z.object({
  instructionId: z.string(),
  motherChecked: z.number().int().min(0),
  motherContaminatedM05: z.number().int().min(0),
  motherUsed: z.number().int().min(0),
  m05: z.number().int().min(0),
  t05: z.number().int().min(0),
  t01: z.number().int().min(0),
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

  const { instructionId, motherChecked, motherContaminatedM05, motherUsed, m05, t05, t01, notes } = parsed.data;

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id: instructionId },
    include: { plantType: true, items: { include: { shelf: { select: { warehouseId: true, warehouse: { select: { code: true } } } } } } },
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

  // Luôn dùng đúng Phòng tối cá nhân của NV đứng tên bản ghi (staffId) — kể cả khi Admin/KHO_MO là người
  // bấm lưu (bù dữ liệu hộ), vì đây là "không gian vật lý" của NV cấy mô, không phải của người thao tác.
  const personalRoom = await getOrCreatePersonalDarkRoom(staffId, warehouseId);

  const items = ([
    { stage: "MAU_ME" as const, stageCode: "M05" as const, quantityCreated: m05 },
    { stage: "THANH_PHAM" as const, stageCode: "T05" as const, quantityCreated: t05 },
    { stage: "THANH_PHAM" as const, stageCode: "T01" as const, quantityCreated: t01 },
  ]).filter((i) => i.quantityCreated > 0);

  const recordItems = [];
  const lotsCreated = [];

  // Lô sản phẩm: mỗi ngày trong tuần chỉ định luôn tạo 1 lô riêng (mã = mã chỉ định + 1 ký tự 2-8 ứng
  // với Thứ 2 - Chủ nhật của ngày nhập) — không gộp nhiều ngày vào 1 lô như trước. "Mỗi ngày chỉ được
  // nhập 1 lần" (existingForDate ở trên) nên không lo trùng mã trong cùng 1 chỉ định. Dùng targetDate
  // (không phải "hôm nay" thao tác) để mã lô/hạn cấy chuyển đúng theo ngày đang bù dữ liệu.
  const productLotCode = generateProductLotCode(instruction.code, targetDate);

  for (const item of items) {
    const expectedMoveAt =
      item.stage === "MAU_ME"
        ? addWeeks(targetDate, instruction.plantType.transferWaitWeeks)
        : addWeeks(targetDate, instruction.plantType.rootingWeeks);
    const lot = await prisma.lot.create({
      data: {
        code: productLotCode,
        plantTypeId: instruction.plantTypeId,
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
  // cao cài đặt (mother_contamination_alert_pct, xem Cài đặt) thì báo cho KHO_MO biết sớm, trước cả khi
  // có phiếu bàn giao thật, để chủ động xử lý khi nhận.
  const motherContaminationPct = parseFloat(await getSystemConfig("mother_contamination_alert_pct", "10")) || 10;
  const contaminatedAgg = await prisma.dailyRecord.aggregate({
    where: { instructionId },
    _sum: { motherContaminatedM05: true },
  });
  const totalContaminated = contaminatedAgg._sum.motherContaminatedM05 ?? 0;
  const motherContaminationRate = instruction.inputMotherQuantity > 0 ? (totalContaminated / instruction.inputMotherQuantity) * 100 : 0;
  if (motherContaminationRate > motherContaminationPct) {
    // Chặn spam: mỗi chỉ định chỉ giữ tối đa 1 alert CHƯA ĐỌC loại này tại 1 thời điểm — nếu tỉ lệ nhiễm
    // vẫn vượt ngưỡng ở lần lưu nhật ký tiếp theo (VD ngày sau) mà KHO_MO chưa kịp đọc alert cũ, không
    // tạo thêm bản ghi trùng; KHO_MO đọc/xử lý xong (đổi status khỏi UNREAD) thì lần lệch tiếp theo mới
    // tạo alert mới.
    const existingContaminationAlert = await prisma.alert.findFirst({
      where: { type: "MOTHER_CONTAMINATION_HIGH", relatedId: instructionId, status: "UNREAD" },
    });
    if (!existingContaminationAlert) {
      await createAlert({
        type: "MOTHER_CONTAMINATION_HIGH",
        title: "Tỉ lệ nhiễm mẫu mẹ sau ủ sáng vượt ngưỡng",
        message: `Chỉ định ${instruction.code}: mẫu mẹ nhiễm ${totalContaminated}/${instruction.inputMotherQuantity} (${Math.round(motherContaminationRate)}%) — vượt ngưỡng ${motherContaminationPct}%`,
        targetRole: "KHO_MO",
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

  // Nghi ngờ cấy sai chỉ định khi CẢ 2 tỉ lệ thực tế (lũy kế cả chỉ định) đều thấp hơn ngưỡng % Admin
  // cấu hình so với tỉ lệ mục tiêu của chính chỉ định này (suy từ motherSampleRatio/rootingRatio KY_THUAT
  // nhập lúc tạo chỉ định) — chỉ 1 trong 2 tỉ lệ thấp thì chưa đủ căn cứ kết luận cấy sai (VD tỉ lệ nhân MM
  // thấp nhưng ra thành phẩm vẫn đạt thì có thể do khác biệt tự nhiên, không phải lỗi thao tác):
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

  let alert = false;
  if (
    totalMotherUsed > 0 &&
    motherRatioPct !== null && finishedRatioPct !== null &&
    motherRatioPct < motherRatioTargetPct && finishedRatioPct < finishedRatioTargetPct
  ) {
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
      await createAlert({
        type: "OUTPUT_DEVIATION",
        title: "Cấy lệch tiến độ so với chỉ định",
        message: `Chỉ định ${instruction.code}: tỉ lệ nhân MM đạt ${Math.round(motherRatioPct)}% (cần ≥${motherRatioTargetPct}%), tỉ lệ ra thành phẩm đạt ${Math.round(finishedRatioPct)}% (cần ≥${finishedRatioTargetPct}%) so với mục tiêu chỉ định`,
        userId: instruction.createdById,
        relatedId: instructionId,
        relatedType: "PlantingInstruction",
      });
    }
  }

  // Tự động chuyển chỉ định sang "Kết thúc" ngay khi thao tác Lưu, nếu xảy ra 1 trong 2 trường hợp:
  // 1. Đã dùng hết mẫu mẹ được cấp (tổng "MM sử dụng" >= inputMotherQuantity) — ưu tiên kiểm tra trước
  //    vì trường hợp này không còn dư gì để bàn giao.
  // 2. Hôm nay là Thứ 7 hoặc Chủ nhật của tuần chỉ định — Thứ 7 là ngày làm việc chính thức, Chủ nhật là
  //    ngày làm thêm (có thể có hoặc không), nên chấp nhận lưu vào 1 trong 2 ngày này là đủ coi như hết
  //    tuần. Chỉ kiểm tra tại đúng thời điểm Lưu này (không có cơ chế quét nền/cron), nên nếu NV không lưu
  //    vào đúng 2 ngày này thì chỉ định sẽ không tự kết thúc qua đây.
  let ended = false;
  let endReason: "MOTHER_USED_UP" | "TIME_UP" | null = null;
  if (instruction.status !== "ENDED") {
    const saturday = addDays(weekEnd, -1);
    if (totalMotherUsed >= instruction.inputMotherQuantity) {
      endReason = "MOTHER_USED_UP";
    } else if (isSameDay(today, saturday) || isSameDay(today, weekEnd)) {
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
    { record, lotsCreated, alert, motherRatioPct, finishedRatioPct, motherRatioTargetPct, finishedRatioTargetPct, ended, endReason },
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
