import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { addWeeks, startOfWeek } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import { sumLotQuantity } from "@/types";
import { shelfMatchesPlantType, isEligibleMotherShelfForStockIn, resolveStockInWarehouseId, STOCK_IN_ROOM_TYPE } from "@/lib/stock-in";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { getCurrentWeekSlot } from "@/lib/week-rotation";

const schema = z
  .object({
    stage: z.enum(["MAU_ME", "THANH_PHAM"]),
    plantTypeId: z.string().min(1),
    stageCode: z.string().min(1),
    // "SHELF" = Phòng sáng (Phòng mẫu mẹ/Phòng ra rễ, xếp vào 1 giàn kệ). "DARK_ROOM" = Phòng tối, gắn
    // thẳng vào Phòng tối cá nhân của 1 NV cấy mô (không có giàn kệ) — xem getOrCreatePersonalDarkRoom.
    destination: z.enum(["SHELF", "DARK_ROOM"]),
    shelfId: z.string().optional(),
    staffId: z.string().optional(),
    quantity: z.number().int().positive(),
    mode: z.enum(["ADD", "REPLACE"]),
    warehouseId: z.string().optional(), // chỉ Admin/Admin cấp cao cần truyền — KHO_MO luôn dùng đúng kho làm việc, bỏ qua field này dù có gửi lên
  })
  .refine((data) => (data.destination === "SHELF" ? !!data.shelfId : !!data.staffId), {
    message: "Thiếu giàn kệ hoặc NV cấy mô",
  });

const STAGE_CODES: Record<"MAU_ME" | "THANH_PHAM", string[]> = {
  MAU_ME: ["M05"],
  THANH_PHAM: ["T01", "T05", "T10"],
};

// Nhập kho thủ công cho KHO_MO (đúng kho làm việc) và Admin/Admin cấp cao (tự chọn kho sản xuất) — cộng
// thêm hoặc cập nhật thay thế số lượng 1 lô (cây hoặc cụm mẫu mẹ), không qua chỉ định cấy/bàn giao như
// luồng thông thường (VD kiểm kê phát hiện thiếu/thừa, nhận hàng ngoài luồng...). 2 nơi nhập: giàn kệ
// (Phòng sáng — Phòng mẫu mẹ/Phòng ra rễ) hoặc Phòng tối cá nhân của 1 NV cấy mô (destination).
//
// mode "ADD" (cộng thêm): nếu nơi nhập đã có sẵn 1 lô ACTIVE cùng mã cây + quy cách thì cộng dồn vào lô đó
// (giống hệt cách upsertLot ở src/lib/goods-receipt.ts merge theo phòng/mã cây/quy cách — lấy lô CŨ NHẤT
// nếu có nhiều lô trùng), không có thì tạo lô mới. mode "REPLACE" (cập nhật thay thế): GHI ĐÈ thẳng số
// lượng lô đó thành đúng số vừa nhập (dùng khi kiểm kê ra số thực tế khác hệ thống) — không có lô nào thì
// coi như REPLACE cũng tương đương tạo mới. Cả 2 nhánh cộng/ghi đè vào lô có sẵn đều KHÔNG đụng tới
// enteredAt/expectedMoveAt của lô đó — đây là sửa số lượng của đúng lô đã tồn tại, không phải 1 đợt nhập
// mới nên không tính lại hạn. Chỉ khi tạo lô hoàn toàn mới mới tính expectedMoveAt (xem logic bên dưới).
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KHO_MO" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Bạn không có quyền dùng chức năng này" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { stage, plantTypeId, stageCode, destination, shelfId, staffId, quantity, mode, warehouseId: requestedWarehouseId } = parsed.data;

  if (!STAGE_CODES[stage].includes(stageCode)) {
    return NextResponse.json({ message: "Quy cách không hợp lệ" }, { status: 400 });
  }

  const resolved = await resolveStockInWarehouseId(role, session!.user.workplaceWarehouseId, requestedWarehouseId ?? null);
  if ("error" in resolved) {
    return NextResponse.json({ message: resolved.error }, { status: 400 });
  }
  const warehouseId = resolved.warehouseId;

  const [plantType, creatingUser] = await Promise.all([
    prisma.plantType.findUnique({
      where: { id: plantTypeId },
      select: { code: true, isActive: true, transferWaitWeeks: true, rootingWeeks: true },
    }),
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { code: true } }),
  ]);
  if (!plantType || !plantType.isActive) {
    return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  }

  const staffCode = creatingUser?.code ?? "000";
  const now = new Date();

  if (destination === "DARK_ROOM") {
    const staff = await prisma.user.findUnique({
      where: { id: staffId! },
      select: { role: true, isActive: true, workplaceWarehouseId: true },
    });
    if (!staff || !staff.isActive || staff.role !== "CAY_MO" || staff.workplaceWarehouseId !== warehouseId) {
      return NextResponse.json({ message: "NV cấy mô không hợp lệ cho kho đã chọn" }, { status: 400 });
    }

    const room = await getOrCreatePersonalDarkRoom(staffId!, warehouseId);
    const existingLot = await prisma.lot.findFirst({
      where: { roomId: room.id, plantTypeId, stageCode, status: "ACTIVE" },
      orderBy: { enteredAt: "asc" },
    });

    if (existingLot) {
      const newQuantity = mode === "ADD" ? existingLot.quantity + quantity : quantity;
      const updated = await prisma.lot.update({ where: { id: existingLot.id }, data: { quantity: newQuantity } });
      return NextResponse.json({ lot: updated, created: false, previousQuantity: existingLot.quantity, newQuantity }, { status: 200 });
    }

    // Phòng tối không tính hạn theo Nhóm tuần giàn kệ (không có giàn kệ) — dùng đúng công thức mặc định
    // giống lúc NV cấy mô tự nhập nhật ký hàng ngày (xem POST /api/daily-records).
    const expectedMoveAt = addWeeks(now, stage === "MAU_ME" ? plantType.transferWaitWeeks : plantType.rootingWeeks);
    const lot = await prisma.$transaction(async (tx) => {
      const code = await generateLotCode({ plantTypeCode: plantType.code, staffCode, stageCode, date: now });
      return tx.lot.create({
        data: {
          code,
          plantTypeId,
          stage,
          stageCode,
          roomId: room.id,
          quantity,
          initialQuantity: quantity,
          status: "ACTIVE",
          enteredAt: now,
          expectedMoveAt,
        },
      });
    });
    return NextResponse.json({ lot, created: true, previousQuantity: 0, newQuantity: quantity }, { status: 201 });
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id: shelfId! },
    select: {
      id: true,
      code: true,
      isActive: true,
      warehouseId: true,
      capacity: true,
      plantTypeId: true,
      allowedCodes: true,
      assignedStaffId: true,
      room: { select: { type: true } },
      rotationGroup: { select: { rotationOrder: true } },
      lots: { where: { status: "ACTIVE" }, select: { id: true, quantity: true, plantTypeId: true, stageCode: true, enteredAt: true } },
    },
  });
  const motherEpochMonday = stage === "MAU_ME" ? await getMotherRotationEpoch() : null;

  if (!shelf || !shelf.isActive || shelf.warehouseId !== warehouseId) {
    return NextResponse.json({ message: "Không tìm thấy giàn kệ trong kho đã chọn" }, { status: 400 });
  }
  if (shelf.room?.type !== STOCK_IN_ROOM_TYPE[stage]) {
    return NextResponse.json({
      message: stage === "MAU_ME" ? "Giàn kệ này không thuộc Phòng mẫu mẹ" : "Giàn kệ này không thuộc Phòng ra rễ",
    }, { status: 400 });
  }
  const eligible = stage === "MAU_ME" ? isEligibleMotherShelfForStockIn(shelf, plantTypeId) : shelfMatchesPlantType(stage, shelf, plantTypeId, plantType.code);
  if (!eligible) {
    return NextResponse.json({ message: `Mã cây ${plantType.code} không được phép xếp vào giàn kệ ${shelf.code}` }, { status: 400 });
  }

  // Lô ACTIVE có sẵn cùng mã cây + quy cách trên đúng giàn kệ này — lấy lô CŨ NHẤT nếu lỡ có nhiều lô
  // trùng (dữ liệu cũ), giống hệt quy ước của upsertLot.
  const existingLot = shelf.lots
    .filter((l) => l.plantTypeId === plantTypeId && l.stageCode === stageCode)
    .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime())[0] ?? null;
  const previousQuantity = existingLot?.quantity ?? 0;

  const used = sumLotQuantity(shelf.lots);
  const capLeft = shelf.capacity === null ? Infinity : shelf.capacity - used;
  // ADD: số thêm vào không được vượt chỗ trống hiện có (capLeft, đã tính đúng vì previousQuantity nằm
  // sẵn trong `used`). REPLACE: số MỚI thay cho previousQuantity, nên chỗ cho phép phải cộng lại phần
  // previousQuantity đang chiếm chỗ của chính lô đó (không tự trừ chỗ của chính nó).
  const allowedMax = mode === "ADD" ? capLeft : capLeft + previousQuantity;
  if (quantity > allowedMax) {
    return NextResponse.json({
      message: `Giàn kệ ${shelf.code} không đủ chỗ trống (còn ${allowedMax.toLocaleString("vi-VN")}, cần ${quantity.toLocaleString("vi-VN")})`,
    }, { status: 400 });
  }

  if (existingLot) {
    const newQuantity = mode === "ADD" ? previousQuantity + quantity : quantity;
    const updated = await prisma.lot.update({ where: { id: existingLot.id }, data: { quantity: newQuantity } });
    return NextResponse.json({ lot: updated, created: false, previousQuantity, newQuantity }, { status: 200 });
  }

  // Mẫu mẹ: hạn cấy chuyển tính THEO NHÓM TUẦN của giàn kệ (khớp đúng cách /instructions và
  // ensureMotherReadyAlerts xác định "đến hạn" — xem src/lib/mother-week-group.ts), không tính từ lúc
  // bấm nút — để lô nhập tay (VD bổ sung hàng kiểm kê thiếu) luôn hiện đúng hạn như các lô cùng Nhóm,
  // không lệch theo giờ nhập. Rơi về addWeeks(now, transferWaitWeeks) nếu giàn kệ chưa thuộc Nhóm tuần
  // nào hoặc SUPER_ADMIN chưa cấu hình "Tuần khởi đầu của Nhóm tuần mẫu mẹ 1" — vì lúc đó hệ thống chưa
  // có lịch xoay vòng nào để bám theo. Thành phẩm (Phòng ra rễ) vẫn tính từ lúc nhập vì
  // src/lib/rooting-week-group.ts chưa đổi sang tính theo Nhóm tuần.
  let expectedMoveAt: Date;
  if (stage === "MAU_ME" && shelf.rotationGroup?.rotationOrder != null && motherEpochMonday) {
    const totalSlots = plantType.transferWaitWeeks;
    const currentSlot = getCurrentWeekSlot(totalSlots, now, motherEpochMonday);
    const weeksUntilDue = (shelf.rotationGroup.rotationOrder - currentSlot + totalSlots) % totalSlots;
    expectedMoveAt = startOfWeek(addWeeks(now, weeksUntilDue), { weekStartsOn: 1 });
  } else {
    expectedMoveAt = addWeeks(now, stage === "MAU_ME" ? plantType.transferWaitWeeks : plantType.rootingWeeks);
  }

  const lot = await prisma.$transaction(async (tx) => {
    const code = await generateLotCode({ plantTypeCode: plantType.code, staffCode, stageCode, date: now });
    return tx.lot.create({
      data: {
        code,
        plantTypeId,
        stage,
        stageCode,
        shelfId: shelfId!,
        quantity,
        initialQuantity: quantity,
        status: "ACTIVE",
        enteredAt: now,
        expectedMoveAt,
      },
    });
  });

  return NextResponse.json({ lot, created: true, previousQuantity: 0, newQuantity: quantity }, { status: 201 });
}
