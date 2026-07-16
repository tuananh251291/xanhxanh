import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addDays } from "date-fns";
import { generateOrderCode } from "@/lib/codes";
import { getAccessibleRoomIds, getAvailableLots } from "@/lib/order-availability";
import { isSerializationFailure } from "@/lib/prisma-errors";
import { z } from "zod";

// T10 (túi 10 cây) chỉ phát sinh trong Kho thành phẩm — xem cùng ghi chú ở api/orders/check/route.ts.
const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

const createSchema = z.object({
  customerCode: z.string().min(1, "Cần nhập mã khách hàng"),
  market: z.enum(["NOI_DIA", "DONG_NAM_A", "EU", "US", "AUS", "NHAT", "HAN_QUOC"], { message: "Cần chọn thị trường" }),
  // Sale tự ước lượng lúc giữ đơn — chỉ để tham khảo lên kế hoạch, không ràng buộc gì (khác holdUntil).
  expectedShipAt: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        plantTypeId: z.string(),
        stageCode: z.string(),
        quantity: z.number().int().positive(),
        // Có giá trị khi dòng này là bù túi từ quy cách khác — `quantity` khi đó là CẢ TÚI đã tròn (VD
        // 25), `neededQuantity` là phần thật cần cho đơn (VD 21); phần dư (quantity - neededQuantity)
        // chỉ quy đổi sang T01 lúc Xác nhận đơn (xem PATCH /api/orders/[id]).
        neededQuantity: z.number().int().min(0).optional(),
      })
    )
    .min(1, "Cần ít nhất 1 dòng để giữ đơn"),
});

// "Tạm giữ đơn hàng" — tạo Order (status HELD) + OrderItem gắn vào từng lô cụ thể. Đọc lại tồn khả dụng
// NGAY TRONG transaction (không tin số đã Check trước đó, vì tồn có thể đã đổi do người khác giữ/kho
// vừa cập nhật) — thiếu tới đâu báo lỗi rõ tới đó, rollback toàn bộ nếu có 1 dòng không đủ.
// Mức cô lập Serializable (giống transfers/route.ts) — nếu không có, 2 request giữ đơn cùng lúc cho
// cùng 1 lô đều có thể đọc thấy tồn đủ TRƯỚC khi bên kia commit (Read Committed không phát hiện được),
// dẫn tới cả 2 cùng giữ thành công dù tồn chỉ đủ 1 đơn (oversell). Serializable khiến Postgres tự huỷ 1
// trong 2 transaction đụng nhau bằng lỗi write conflict — bắt lỗi đó bên dưới để trả 409 rõ ràng.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }
  const holdDays = session.user.holdDays;
  if (!holdDays) {
    return NextResponse.json(
      { message: "Bạn chưa được Admin cài đặt Năng lực giữ đơn — liên hệ Admin trước khi tạm giữ đơn hàng" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  for (const item of parsed.data.items) {
    if (!FINISHED_STAGE_CODES.has(item.stageCode)) {
      return NextResponse.json({ message: `Quy cách "${item.stageCode}" không hợp lệ (T01/T05/T10)` }, { status: 400 });
    }
  }

  const { customerCode, market, expectedShipAt, notes, items } = parsed.data;
  const roomIds = await getAccessibleRoomIds(session.user.id, session.user.workplaceWarehouseId);

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const code = await generateOrderCode(tx);
        const holdUntil = addDays(new Date(), holdDays);

        const created = await tx.order.create({
          data: {
            code,
            saleId: session.user.id,
            customerCode,
            market,
            expectedShipAt: expectedShipAt ? new Date(expectedShipAt) : null,
            notes,
            status: "HELD",
            holdUntil,
          },
        });

        for (const item of items) {
          const lots = await getAvailableLots(roomIds, item.plantTypeId, item.stageCode, tx);

          if (item.neededQuantity !== undefined) {
            // Bù túi — phải lấy NGUYÊN item.quantity (đã tròn túi, VD 25) từ ĐÚNG 1 lô duy nhất, vì đây
            // ánh xạ 1-1 sang 1 Yêu cầu xử lý sau này (1 sourceLotId — xem PATCH /api/orders/[id] action
            // confirm), không tách nhiều lô như trường hợp thường ("mở túi" là thao tác vật lý trên 1 lô
            // cụ thể). Trừ NGAY khỏi tồn khả dụng qua OrderItem (giống mọi dòng HELD khác) — không đụng
            // Lot.quantity thật, chỉ thật sự trừ/cộng khi Kho thành phẩm bấm "Hoàn thành xử lý".
            const lot = lots.find((l) => l.available >= item.quantity);
            if (!lot) {
              throw new Error(
                `Tồn kho đã thay đổi — vui lòng Check lại (quy cách ${item.stageCode} không còn đủ 1 lô để mở nguyên túi ${item.quantity})`
              );
            }
            await tx.orderItem.create({
              data: { orderId: created.id, lotId: lot.id, quantity: item.quantity, neededQuantity: item.neededQuantity },
            });
            continue;
          }

          const totalAvailable = lots.reduce((s, l) => s + l.available, 0);
          if (totalAvailable < item.quantity) {
            throw new Error(`Tồn kho đã thay đổi — vui lòng Check lại (quy cách ${item.stageCode} chỉ còn ${totalAvailable}/${item.quantity} cần giữ)`);
          }

          let remaining = item.quantity;
          for (const lot of lots) {
            if (remaining <= 0) break;
            const take = Math.min(lot.available, remaining);
            if (take <= 0) continue;
            await tx.orderItem.create({
              data: { orderId: created.id, lotId: lot.id, quantity: take },
            });
            remaining -= take;
          }
        }

        return created;
      },
      { isolationLevel: "Serializable" }
    );

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    if (isSerializationFailure(err)) {
      return NextResponse.json(
        { message: "Có người khác vừa giữ đơn cùng lúc, vui lòng Check lại" },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
