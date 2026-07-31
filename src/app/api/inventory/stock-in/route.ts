import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { addWeeks, startOfWeek, startOfDay, endOfDay } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import { sumLotQuantity } from "@/types";
import { shelfMatchesPlantType, isEligibleMotherShelfForStockIn, resolveStockInWarehouseId, STOCK_IN_ROOM_TYPE } from "@/lib/stock-in";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { getCurrentWeekSlot } from "@/lib/week-rotation";

const itemSchema = z.object({
  plantTypeId: z.string().min(1),
  stageCode: z.string().min(1),
  quantity: z.number().int().positive(),
  // Chỉ áp dụng cho Phòng tối — ngày NV cấy mô THỰC TẾ đưa ĐÚNG DÒNG NÀY vào Phòng tối cá nhân (có thể là
  // hôm nay hoặc 1 ngày trước đó nếu nhập bù), dùng làm enteredAt + tính expectedMoveAt (giống targetDate
  // của POST /api/daily-records), không dùng thời điểm bấm nút Nhập kho. Mỗi dòng 1 mã cây nên được phép
  // tự chọn ngày riêng (VD dòng này nhập bù hôm qua, dòng khác nhập đúng hôm nay).
  enteredDate: z.string().optional(),
});

const schema = z
  .object({
    // "SHELF" = Phòng sáng (Phòng mẫu mẹ/Phòng ra rễ, xếp vào 1 giàn kệ). "DARK_ROOM" = Phòng tối, gắn
    // thẳng vào Phòng tối cá nhân của 1 NV cấy mô (không có giàn kệ) — xem getOrCreatePersonalDarkRoom.
    destination: z.enum(["SHELF", "DARK_ROOM"]),
    shelfId: z.string().optional(),
    staffId: z.string().optional(),
    mode: z.enum(["ADD", "REPLACE"]),
    warehouseId: z.string().optional(), // chỉ Admin/Admin cấp cao cần truyền — KHO_MO luôn dùng đúng kho làm việc, bỏ qua field này dù có gửi lên
    // Nhiều dòng (mã cây/quy cách/số lượng/ngày nhập khác nhau) trong 1 lần nhập, dùng chung nơi nhập
    // (giàn kệ/NV) + kiểu nhập ở trên — VD Phòng tối nhận nhiều mã cây cùng lúc, hoặc 1 giàn kệ Phòng ra
    // rễ xếp nhiều quy cách/mã cây khác nhau trong cùng 1 đợt.
    items: z.array(itemSchema).min(1),
  })
  .refine((data) => (data.destination === "SHELF" ? !!data.shelfId : !!data.staffId), {
    message: "Thiếu giàn kệ hoặc NV cấy mô",
  })
  .refine((data) => data.destination !== "DARK_ROOM" || data.items.every((i) => !!i.enteredDate), {
    message: "Thiếu ngày nhập kho tối",
  });

// stageCode luôn suy ra đúng 1 stage duy nhất — không cần client tự truyền "stage" riêng (tránh lệch
// stage/stageCode do lỗi client).
function stageOfCode(code: string): "MAU_ME" | "THANH_PHAM" | null {
  if (code === "M05") return "MAU_ME";
  if (code === "T01" || code === "T05" || code === "T10") return "THANH_PHAM";
  return null;
}

// Lỗi nghiệp vụ ném ra TRONG transaction để rollback toàn bộ batch (tất cả hoặc không dòng nào) — bắt lại
// ở catch bên ngoài để trả về đúng message thân thiện thay vì lỗi 500.
class StockInError extends Error {}

// Nhập kho thủ công cho KHO_MO (đúng kho làm việc) và Admin/Admin cấp cao (tự chọn kho sản xuất) — cộng
// thêm hoặc cập nhật thay thế số lượng nhiều dòng lô (cây hoặc cụm mẫu mẹ) trong 1 lần nhập, không qua
// chỉ định cấy/bàn giao như luồng thông thường (VD kiểm kê phát hiện thiếu/thừa, nhận hàng ngoài luồng...).
// 2 nơi nhập: giàn kệ (Phòng sáng — Phòng mẫu mẹ/Phòng ra rễ) hoặc Phòng tối cá nhân của 1 NV cấy mô
// (destination) — dùng CHUNG cho mọi dòng trong `items`, cùng 1 kiểu nhập (mode).
//
// mode "ADD" (cộng thêm): nếu nơi nhập đã có sẵn 1 lô ACTIVE cùng mã cây + quy cách thì cộng dồn vào lô đó
// (giống hệt cách upsertLot ở src/lib/goods-receipt.ts merge theo phòng/mã cây/quy cách — lấy lô CŨ NHẤT
// nếu có nhiều lô trùng), không có thì tạo lô mới. mode "REPLACE" (cập nhật thay thế): GHI ĐÈ thẳng số
// lượng lô đó thành đúng số vừa nhập (dùng khi kiểm kê ra số thực tế khác hệ thống) — không có lô nào thì
// coi như REPLACE cũng tương đương tạo mới. Cả 2 nhánh cộng/ghi đè vào lô có sẵn đều KHÔNG đụng tới
// enteredAt/expectedMoveAt của lô đó — đây là sửa số lượng của đúng lô đã tồn tại, không phải 1 đợt nhập
// mới nên không tính lại hạn. Chỉ khi tạo lô hoàn toàn mới mới tính expectedMoveAt (xem logic bên dưới).
//
// Toàn bộ các dòng xử lý trong 1 prisma.$transaction — 1 dòng lỗi (VD vượt sức chứa giàn kệ) thì KHÔNG
// dòng nào được tạo/cập nhật, giữ đúng tính atomic của cả lượt nhập.
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
  const { destination, shelfId, staffId, items, mode, warehouseId: requestedWarehouseId } = parsed.data;

  for (const item of items) {
    if (!stageOfCode(item.stageCode)) {
      return NextResponse.json({ message: `Quy cách không hợp lệ: ${item.stageCode}` }, { status: 400 });
    }
  }

  const resolved = await resolveStockInWarehouseId(role, session!.user.workplaceWarehouseId, requestedWarehouseId ?? null);
  if ("error" in resolved) {
    return NextResponse.json({ message: resolved.error }, { status: 400 });
  }
  const warehouseId = resolved.warehouseId;

  const [plantTypes, creatingUser] = await Promise.all([
    prisma.plantType.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.plantTypeId))] } },
      select: { id: true, code: true, isActive: true, transferWaitWeeks: true, rootingWeeks: true },
    }),
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { code: true } }),
  ]);
  const plantTypeMap = new Map(plantTypes.map((p) => [p.id, p]));
  for (const item of items) {
    const pt = plantTypeMap.get(item.plantTypeId);
    if (!pt || !pt.isActive) {
      return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
    }
  }

  const staffCode = creatingUser?.code ?? "000";
  const now = new Date();

  try {
    if (destination === "DARK_ROOM") {
      const staff = await prisma.user.findUnique({
        where: { id: staffId! },
        select: { role: true, isActive: true, workplaceWarehouseId: true },
      });
      if (!staff || !staff.isActive || staff.role !== "CAY_MO" || staff.workplaceWarehouseId !== warehouseId) {
        return NextResponse.json({ message: "NV cấy mô không hợp lệ cho kho đã chọn" }, { status: 400 });
      }

      // Ngày NV thực tế đưa TỪNG DÒNG vào Phòng tối — mỗi dòng 1 mã cây được tự chọn ngày riêng (VD dòng
      // này nhập bù hôm qua, dòng khác nhập đúng hôm nay), cho phép bù lại ngày trước đó (nhập trễ), không
      // cho chọn ngày tương lai vì về mặt vật lý chưa thể xảy ra. Kiểm tra hết TRƯỚC khi mở transaction —
      // 1 dòng sai ngày thì không dòng nào được tạo/cập nhật.
      const enteredAtByItem = new Map<number, Date>();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const enteredAt = new Date(item.enteredDate!);
        if (Number.isNaN(enteredAt.getTime()) || enteredAt > now) {
          return NextResponse.json({
            message: `Ngày nhập kho tối không hợp lệ cho mã ${plantTypeMap.get(item.plantTypeId)!.code} (dòng ${i + 1}) — không được chọn ngày trong tương lai`,
          }, { status: 400 });
        }
        enteredAtByItem.set(i, enteredAt);
      }

      const room = await getOrCreatePersonalDarkRoom(staffId!, warehouseId);

      const results = await prisma.$transaction(async (tx) => {
        const out = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const pt = plantTypeMap.get(item.plantTypeId)!;
          const stage = stageOfCode(item.stageCode)!;
          const enteredAt = enteredAtByItem.get(i)!;
          // Đọc lại trong transaction (không dùng snapshot ngoài) — nếu batch có 2 dòng trùng mã cây +
          // quy cách + ngày thì dòng sau thấy đúng lô dòng trước vừa tạo/cập nhật, không tạo trùng lô.
          // Chỉ gộp vào lô CÙNG NGÀY (enteredAt) — Phòng tối luôn tạo 1 lô riêng/ngày (giống quy ước của
          // POST /api/daily-records), nếu tìm theo mọi ngày sẽ vô tình gộp/ghi đè nhầm vào lô của 1 ngày
          // cấy khác (VD lô nhật ký hôm qua) — đã từng xảy ra thật, xem lịch sử sửa lỗi.
          const existingLot = await tx.lot.findFirst({
            where: {
              roomId: room.id,
              plantTypeId: item.plantTypeId,
              stageCode: item.stageCode,
              status: "ACTIVE",
              enteredAt: { gte: startOfDay(enteredAt), lte: endOfDay(enteredAt) },
            },
            orderBy: { enteredAt: "asc" },
          });

          if (existingLot) {
            const newQuantity = mode === "ADD" ? existingLot.quantity + item.quantity : item.quantity;
            const updated = await tx.lot.update({ where: { id: existingLot.id }, data: { quantity: newQuantity } });
            out.push({ lot: updated, created: false, previousQuantity: existingLot.quantity, newQuantity, plantTypeCode: pt.code, stageCode: item.stageCode });
            continue;
          }

          // Phòng tối không tính hạn theo Nhóm tuần giàn kệ (không có giàn kệ) — dùng đúng công thức mặc
          // định giống lúc NV cấy mô tự nhập nhật ký hàng ngày (xem POST /api/daily-records), tính từ
          // enteredAt của ĐÚNG DÒNG NÀY (ngày NV thực tế nhập) chứ không phải thời điểm bấm nút Nhập kho.
          const expectedMoveAt = addWeeks(enteredAt, stage === "MAU_ME" ? pt.transferWaitWeeks : pt.rootingWeeks);
          const code = await generateLotCode({ plantTypeCode: pt.code, staffCode, stageCode: item.stageCode, date: enteredAt, client: tx });
          const created = await tx.lot.create({
            data: {
              code,
              plantTypeId: item.plantTypeId,
              stage,
              stageCode: item.stageCode,
              roomId: room.id,
              quantity: item.quantity,
              initialQuantity: item.quantity,
              status: "ACTIVE",
              enteredAt,
              expectedMoveAt,
            },
          });
          out.push({ lot: created, created: true, previousQuantity: 0, newQuantity: item.quantity, plantTypeCode: pt.code, stageCode: item.stageCode });
        }
        return out;
      });

      return NextResponse.json({ results }, { status: 200 });
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
    if (!shelf || !shelf.isActive || shelf.warehouseId !== warehouseId) {
      return NextResponse.json({ message: "Không tìm thấy giàn kệ trong kho đã chọn" }, { status: 400 });
    }

    // Kiểm tra trước TOÀN BỘ các dòng khớp đúng loại phòng + được phép xếp mã cây — fail sớm, không mở
    // transaction nếu có dòng nào sai ngay từ bước này.
    for (const item of items) {
      const pt = plantTypeMap.get(item.plantTypeId)!;
      const stage = stageOfCode(item.stageCode)!;
      if (shelf.room?.type !== STOCK_IN_ROOM_TYPE[stage]) {
        return NextResponse.json({
          message: stage === "MAU_ME" ? "Giàn kệ này không thuộc Phòng mẫu mẹ" : "Giàn kệ này không thuộc Phòng ra rễ",
        }, { status: 400 });
      }
      const eligible = stage === "MAU_ME" ? isEligibleMotherShelfForStockIn(shelf, item.plantTypeId) : shelfMatchesPlantType(stage, shelf, item.plantTypeId, pt.code);
      if (!eligible) {
        return NextResponse.json({ message: `Mã cây ${pt.code} không được phép xếp vào giàn kệ ${shelf.code}` }, { status: 400 });
      }
    }

    const motherEpochMonday = items.some((i) => stageOfCode(i.stageCode) === "MAU_ME") ? await getMotherRotationEpoch() : null;

    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      // Chỗ trống còn lại của giàn kệ tính LŨY KẾ qua từng dòng trong batch — nhiều dòng có thể cùng
      // chiếm chỗ của đúng 1 giàn kệ trong 1 lần nhập (VD Phòng ra rễ xếp cả T01 và T05 cùng lúc).
      let runningUsed = sumLotQuantity(shelf.lots);

      for (const item of items) {
        const pt = plantTypeMap.get(item.plantTypeId)!;
        const stage = stageOfCode(item.stageCode)!;

        const existingLot = await tx.lot.findFirst({
          where: { shelfId: shelfId!, plantTypeId: item.plantTypeId, stageCode: item.stageCode, status: "ACTIVE" },
          orderBy: { enteredAt: "asc" },
        });
        const previousQuantity = existingLot?.quantity ?? 0;

        const capLeft = shelf.capacity === null ? Infinity : shelf.capacity - runningUsed;
        // ADD: số thêm vào không được vượt chỗ trống hiện có. REPLACE: số MỚI thay cho previousQuantity,
        // nên chỗ cho phép phải cộng lại phần previousQuantity đang chiếm chỗ của chính lô đó.
        const allowedMax = mode === "ADD" ? capLeft : capLeft + previousQuantity;
        if (item.quantity > allowedMax) {
          throw new StockInError(
            `Giàn kệ ${shelf.code} không đủ chỗ trống cho mã ${pt.code} (còn ${allowedMax.toLocaleString("vi-VN")}, cần ${item.quantity.toLocaleString("vi-VN")})`
          );
        }

        if (existingLot) {
          const newQuantity = mode === "ADD" ? previousQuantity + item.quantity : item.quantity;
          const updated = await tx.lot.update({ where: { id: existingLot.id }, data: { quantity: newQuantity } });
          runningUsed = runningUsed - previousQuantity + newQuantity;
          out.push({ lot: updated, created: false, previousQuantity, newQuantity, plantTypeCode: pt.code, stageCode: item.stageCode });
          continue;
        }

        // Mẫu mẹ: hạn cấy chuyển tính THEO NHÓM TUẦN của giàn kệ (khớp đúng cách /instructions và
        // ensureMotherReadyAlerts xác định "đến hạn" — xem src/lib/mother-week-group.ts), không tính từ
        // lúc bấm nút — để lô nhập tay (VD bổ sung hàng kiểm kê thiếu) luôn hiện đúng hạn như các lô
        // cùng Nhóm, không lệch theo giờ nhập. Rơi về addWeeks(now, transferWaitWeeks) nếu giàn kệ chưa
        // thuộc Nhóm tuần nào hoặc SUPER_ADMIN chưa cấu hình "Tuần khởi đầu của Nhóm tuần mẫu mẹ 1" — vì
        // lúc đó hệ thống chưa có lịch xoay vòng nào để bám theo. Thành phẩm (Phòng ra rễ) vẫn tính từ
        // lúc nhập vì src/lib/rooting-week-group.ts chưa đổi sang tính theo Nhóm tuần.
        let expectedMoveAt: Date;
        if (stage === "MAU_ME" && shelf.rotationGroup?.rotationOrder != null && motherEpochMonday) {
          const totalSlots = pt.transferWaitWeeks;
          const currentSlot = getCurrentWeekSlot(totalSlots, now, motherEpochMonday);
          const weeksUntilDue = (shelf.rotationGroup.rotationOrder - currentSlot + totalSlots) % totalSlots;
          expectedMoveAt = startOfWeek(addWeeks(now, weeksUntilDue), { weekStartsOn: 1 });
        } else {
          expectedMoveAt = addWeeks(now, stage === "MAU_ME" ? pt.transferWaitWeeks : pt.rootingWeeks);
        }

        const code = await generateLotCode({ plantTypeCode: pt.code, staffCode, stageCode: item.stageCode, date: now, client: tx });
        const created = await tx.lot.create({
          data: {
            code,
            plantTypeId: item.plantTypeId,
            stage,
            stageCode: item.stageCode,
            shelfId: shelfId!,
            quantity: item.quantity,
            initialQuantity: item.quantity,
            status: "ACTIVE",
            enteredAt: now,
            expectedMoveAt,
          },
        });
        runningUsed += item.quantity;
        out.push({ lot: created, created: true, previousQuantity: 0, newQuantity: item.quantity, plantTypeCode: pt.code, stageCode: item.stageCode });
      }

      return out;
    });

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    if (err instanceof StockInError) {
      return NextResponse.json({ message: err.message }, { status: 400 });
    }
    throw err;
  }
}
