import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addDays, addMonths } from "date-fns";
import { generateOrderCode } from "@/lib/codes";
import { getAccessibleRoomIds, getInProgressRoomIds, getQualifiedLots } from "@/lib/order-availability";
import { isSerializationFailure } from "@/lib/prisma-errors";
import { getSystemConfig } from "@/lib/inventory";
import { canActAsSale } from "@/types";
import { z } from "zod";

// T10 (túi 10 cây) chỉ phát sinh trong Kho thành phẩm — xem cùng ghi chú ở api/orders/check/route.ts.
const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

// Nhóm khách hàng "Khách công ty lớn" được giữ đơn 5 THÁNG kể từ lúc Tạm giữ, thay vì theo Năng lực giữ
// đơn (ngày) mặc định của NV Sale — xem CustomerGroup, prisma/schema.prisma.
const LARGE_COMPANY_HOLD_MONTHS = 5;

const createSchema = z.object({
  customerId: z.string().min(1, "Cần chọn khách hàng"),
  market: z.enum(["NOI_DIA", "DONG_NAM_A", "EU", "US", "AUS", "NHAT", "HAN_QUOC"], { message: "Cần chọn thị trường" }),
  // Bắt buộc — quyết định lô "ảo" nào (Kế hoạch nhập kho chưa về, xem src/lib/order-availability.ts)
  // được tính vào khả dụng lúc giữ đơn, không chỉ để tham khảo như trước.
  expectedShipAt: z.string().min(1, "Cần chọn ngày xuất dự kiến"),
  notes: z.string().optional(),
  // "Mã đơn xuất khẩu" — nhập tay, tách khỏi mã đơn nội bộ (Order.code) tự sinh, dùng cho phiếu in.
  exportCode: z.string().optional(),
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
        // "Yêu cầu đặc biệt" — hiện dòng nhập tay (order-check-form.tsx) chưa có UI nhập field này, chỉ
        // luồng tải Excel (POST /api/orders/import-items) set giá trị; dùng ở phiếu in (xem /orders/[id]).
        notes: z.string().optional(),
      })
    )
    .min(1, "Cần ít nhất 1 dòng để giữ đơn"),
});

// "Tạm giữ đơn hàng" — tạo Order (status HELD) + OrderItem gắn vào từng lô cụ thể. Đọc lại tồn đạt tiêu chuẩn
// NGAY TRONG transaction (không tin số đã Check trước đó, vì tồn có thể đã đổi do người khác giữ/kho
// vừa cập nhật) — thiếu tới đâu báo lỗi rõ tới đó, rollback toàn bộ nếu có 1 dòng không đủ.
// Mức cô lập Serializable (giống transfers/route.ts) — nếu không có, 2 request giữ đơn cùng lúc cho
// cùng 1 lô đều có thể đọc thấy tồn đủ TRƯỚC khi bên kia commit (Read Committed không phát hiện được),
// dẫn tới cả 2 cùng giữ thành công dù tồn chỉ đủ 1 đơn (oversell). Serializable khiến Postgres tự huỷ 1
// trong 2 transaction đụng nhau bằng lỗi write conflict — bắt lỗi đó bên dưới để trả 409 rõ ràng.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canActAsSale(session.user.role)) {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  for (const item of parsed.data.items) {
    if (!FINISHED_STAGE_CODES.has(item.stageCode)) {
      return NextResponse.json({ message: `Quy cách "${item.stageCode}" không hợp lệ (T01/T05/T10)` }, { status: 400 });
    }
  }

  const { customerId, market, expectedShipAt, notes, exportCode, items } = parsed.data;
  const shipDate = new Date(expectedShipAt);
  if (Number.isNaN(shipDate.getTime())) {
    return NextResponse.json({ message: "Ngày xuất dự kiến không hợp lệ" }, { status: 400 });
  }

  // Chỉ giữ đơn được cho khách hàng ĐÚNG mình đang phụ trách (assignedToId) — khớp đúng phạm vi khách NV
  // Sale thấy được ở /customer-status (GET /api/customer-status), tránh giữ nhầm/giữ hộ khách người khác.
  // Quản lý kho thành phẩm thao tác HỘ (xem canActAsSale) không bị giới hạn theo khách mình phụ trách —
  // chỉ cần khách đã có NV bán hàng phụ trách, vì đơn LUÔN được gán saleId = customer.assignedToId (NV
  // bán hàng thật đang phụ trách), không phải id người quản lý đang bấm hộ — giống hệt dữ liệu sẽ có khi
  // sau này NV bán hàng tự nhập bằng tài khoản riêng.
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, code: true, customerGroup: true, assignedToId: true },
  });
  if (!customer) return NextResponse.json({ message: "Không tìm thấy khách hàng" }, { status: 400 });
  if (session.user.role === "SALE" && customer.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Bạn không phụ trách khách hàng này" }, { status: 403 });
  }
  if (!customer.assignedToId) {
    return NextResponse.json({ message: "Khách hàng chưa có NV bán hàng phụ trách — không tạo được đơn hộ" }, { status: 400 });
  }

  // Năng lực giữ đơn (ngày) riêng từng NV Sale (Admin gõ tay ở /users) là NGOẠI LỆ — chỉ khi chưa cài đặt
  // (null) mới rơi về "Thời gian giữ đơn mặc định" chung ở /settings (SystemConfig "default_hold_days"),
  // đọc SỐNG mỗi lần tạo đơn nên Admin sửa số mặc định là áp dụng ngay cho mọi NV chưa có số riêng.
  const salesUserHoldDays = session.user.role === "SALE"
    ? session.user.holdDays
    : (await prisma.user.findUnique({ where: { id: customer.assignedToId }, select: { holdDays: true } }))?.holdDays;
  const defaultHoldDays = parseInt(await getSystemConfig("default_hold_days", "3"), 10) || 3;
  const holdDays = salesUserHoldDays ?? defaultHoldDays;

  const roomIds = await getAccessibleRoomIds(session.user.id, session.user.workplaceWarehouseId);
  const inProgressRoomIds = await getInProgressRoomIds(session.user.workplaceWarehouseId);

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const code = await generateOrderCode(tx);
        // Khách công ty lớn: giữ đơn 5 tháng, không phụ thuộc Năng lực giữ đơn (ngày) của NV Sale.
        const holdUntil = customer.customerGroup === "KHACH_CONG_TY_LON"
          ? addMonths(new Date(), LARGE_COMPANY_HOLD_MONTHS)
          : addDays(new Date(), holdDays);

        const created = await tx.order.create({
          data: {
            code,
            exportCode,
            saleId: customer.assignedToId!,
            customerCode: customer.code,
            customerId: customer.id,
            market,
            expectedShipAt: shipDate,
            notes,
            status: "HELD",
            holdUntil,
          },
        });

        for (const item of items) {
          // Dòng cần xử lý (bù túi trong Phòng đạt tiêu chuẩn HOẶC chuyển từ Kho hàn túi/Theo dõi — cả 2
          // đều sinh Yêu cầu xử lý cây lúc Xác nhận, xem confirmOrder) được tìm trong CẢ Phòng đạt tiêu
          // chuẩn/thị trường lẫn Kho hàn túi/Theo dõi (tier 3). Dòng thường (không cần xử lý) CHỈ được
          // tìm trong Phòng đạt tiêu chuẩn/thị trường — không bao giờ được lấy thẳng từ Kho hàn túi/Theo
          // dõi vì hàng ở đó chưa đạt chuẩn/chưa đóng gói, phải qua xử lý trước.
          const searchRoomIds = item.neededQuantity !== undefined ? [...roomIds, ...inProgressRoomIds] : roomIds;
          const lots = await getQualifiedLots(searchRoomIds, item.plantTypeId, item.stageCode, tx, { shipDate });

          if (item.neededQuantity !== undefined) {
            // Cần xử lý — phải lấy NGUYÊN item.quantity (đã tròn túi, VD 25) từ ĐÚNG 1 lô duy nhất, vì đây
            // ánh xạ 1-1 sang 1 Yêu cầu xử lý sau này (1 sourceLotId — xem PATCH /api/orders/[id] action
            // confirm), không tách nhiều lô như trường hợp thường ("mở túi"/"chuyển phòng" là thao tác vật
            // lý trên 1 lô cụ thể). Trừ NGAY khỏi tồn đạt tiêu chuẩn qua OrderItem (giống mọi dòng HELD
            // khác) — không đụng Lot.quantity thật, chỉ thật sự trừ/cộng khi Kho thành phẩm bấm "Hoàn
            // thành xử lý".
            const lot = lots.find((l) => l.available >= item.quantity);
            if (!lot) {
              throw new Error(
                `Tồn kho đã thay đổi — vui lòng Check lại (quy cách ${item.stageCode} không còn đủ 1 lô để mở nguyên túi ${item.quantity})`
              );
            }
            await tx.orderItem.create({
              data: { orderId: created.id, lotId: lot.id, quantity: item.quantity, neededQuantity: item.neededQuantity, notes: item.notes },
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
              data: { orderId: created.id, lotId: lot.id, quantity: take, notes: item.notes },
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
