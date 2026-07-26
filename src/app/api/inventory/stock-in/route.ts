import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { addWeeks, startOfWeek } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import { sumLotQuantity } from "@/types";
import { shelfMatchesPlantType, STOCK_IN_ROOM_TYPE } from "@/lib/stock-in";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { getCurrentWeekSlot } from "@/lib/week-rotation";

const schema = z.object({
  stage: z.enum(["MAU_ME", "THANH_PHAM"]),
  plantTypeId: z.string().min(1),
  stageCode: z.string().min(1),
  shelfId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const STAGE_CODES: Record<"MAU_ME" | "THANH_PHAM", string[]> = {
  MAU_ME: ["M05"],
  THANH_PHAM: ["T01", "T05", "T10"],
};

// Nhập kho thủ công cho KHO_MO — cộng thẳng 1 lô mới (cây hoặc cụm mẫu mẹ) vào 1 giàn kệ trong đúng kho
// làm việc của NV, không qua chỉ định cấy/bàn giao như luồng thông thường (VD kiểm kê phát hiện thiếu,
// nhận hàng ngoài luồng...). Bắt buộc đúng 2 nguyên tắc: (1) đúng mã cây được phép xếp vào giàn đó — xem
// shelfMatchesPlantType, (2) không vượt sức chứa còn lại — validate LẠI ở server dù UI đã lọc trước, vì
// nhiều tab/nhiều NV có thể cùng thao tác đồng thời.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") {
    return NextResponse.json({ message: "Chỉ NV kho mô mới dùng được chức năng này" }, { status: 403 });
  }
  if (!session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán kho làm việc — liên hệ Admin cấp cao" }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { stage, plantTypeId, stageCode, shelfId, quantity } = parsed.data;

  if (!STAGE_CODES[stage].includes(stageCode)) {
    return NextResponse.json({ message: "Quy cách không hợp lệ" }, { status: 400 });
  }

  const [plantType, shelf, creatingUser, motherEpochMonday] = await Promise.all([
    prisma.plantType.findUnique({
      where: { id: plantTypeId },
      select: { code: true, isActive: true, transferWaitWeeks: true, rootingWeeks: true },
    }),
    prisma.shelf.findUnique({
      where: { id: shelfId },
      select: {
        id: true,
        code: true,
        isActive: true,
        warehouseId: true,
        capacity: true,
        plantTypeId: true,
        allowedCodes: true,
        room: { select: { type: true } },
        rotationGroup: { select: { rotationOrder: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } }),
    getMotherRotationEpoch(),
  ]);

  if (!plantType || !plantType.isActive) {
    return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  }
  if (!shelf || !shelf.isActive || shelf.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Không tìm thấy giàn kệ trong kho bạn làm việc" }, { status: 400 });
  }
  if (shelf.room?.type !== STOCK_IN_ROOM_TYPE[stage]) {
    return NextResponse.json({
      message: stage === "MAU_ME" ? "Giàn kệ này không thuộc Phòng mẫu mẹ" : "Giàn kệ này không thuộc Phòng ra rễ",
    }, { status: 400 });
  }
  if (!shelfMatchesPlantType(stage, shelf, plantTypeId, plantType.code)) {
    return NextResponse.json({ message: `Mã cây ${plantType.code} không được phép xếp vào giàn kệ ${shelf.code}` }, { status: 400 });
  }

  const used = sumLotQuantity(shelf.lots);
  const capLeft = shelf.capacity === null ? Infinity : shelf.capacity - used;
  if (quantity > capLeft) {
    return NextResponse.json({
      message: `Giàn kệ ${shelf.code} không đủ chỗ trống (còn ${capLeft.toLocaleString("vi-VN")}, cần ${quantity.toLocaleString("vi-VN")})`,
    }, { status: 400 });
  }

  const staffCode = creatingUser?.code ?? "000";
  const now = new Date();
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
        shelfId,
        quantity,
        initialQuantity: quantity,
        status: "ACTIVE",
        enteredAt: now,
        expectedMoveAt,
      },
    });
  });

  return NextResponse.json(lot, { status: 201 });
}
