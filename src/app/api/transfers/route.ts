import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { isSerializationFailure } from "@/lib/prisma-errors";
import { SURPLUS_TRANSFER_TAG } from "@/types";
import { z } from "zod";

class DuplicateTransferError extends Error {}
class PendingOldHandoverError extends Error {}

// toWarehouseId/toRoomId để trống khi bàn giao "phòng tối → kho sáng": đích cụ thể (Phòng mẫu mẹ hay
// Phòng ra rễ, kệ nào) do hệ thống tự chỉ định lúc KHO_MO xác nhận (xem PATCH /api/transfers/[id]),
// nên chỉ cần suy ra đúng kho (cùng kho sản xuất với nguồn) — không cần người tạo phiếu chọn tay.
const createSchema = z.object({
  toWarehouseId: z.string().optional(),
  toRoomId: z.string().optional(),
  toUserId: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    lotId: z.string(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
    // NV cấy mô tự khai "không đạt" (VD cây thành phẩm quá nhỏ) trong số `quantity` — CHỈ áp dụng cho lô
    // thành phẩm (T01/T05), validate lại ở dưới (chặn nếu gửi cho lô mẫu mẹ hoặc vượt quá quantity). Xem
    // TransferItem.unqualifiedQuantity.
    unqualifiedQuantity: z.number().int().min(0).default(0),
  })).min(1, "Cần chọn ít nhất 1 lô"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role === "CAY_MO") where.fromUserId = session.user.id;
  // Kho mô không còn dùng endpoint chung này nữa — bàn giao Phòng tối (luồng Xanh, luồng Đỏ, và MM dư)
  // giờ xử lý hết ở các API riêng dưới /api/transfers/receive-phong-toi/* (xem trang
  // /transfers/receive-phong-toi). Trả rỗng để tránh lộ dữ liệu nếu vẫn còn nơi nào gọi nhầm.
  if (role === "KHO_MO") return NextResponse.json([]);
  if (role === "KHO_THANH_PHAM") {
    where.OR = [
      { fromUserId: session.user.id },
      { toUserId: session.user.id },
      // Bàn giao thành phẩm (Phòng ra rễ → Kho thành phẩm) — KHO_THANH_PHAM cần thấy để xác nhận nhận.
      { toUserId: null, fromRoom: { type: "PHONG_RA_RE" } },
    ];
  }

  const transfers = await prisma.transfer.findMany({
    where,
    include: {
      fromWarehouse: { select: { name: true, type: true } },
      fromRoom: { select: { name: true, type: true } },
      toWarehouse: {
        select: {
          name: true,
          type: true,
          shelves: { where: { isActive: true, roomId: null } },
          // Kho thành phẩm — cần 2 phòng này để chia số lượng khi nhận bàn giao thành phẩm từ Phòng ra rễ.
          rooms: { where: { type: { in: ["PHONG_THEO_DOI", "PHONG_HAN_TUI"] }, isActive: true }, select: { id: true, name: true, type: true } },
        },
      },
      toRoom: { select: { name: true, type: true, shelves: { where: { isActive: true } } } },
      fromUser: { select: { code: true, name: true } },
      toUser: { select: { name: true } },
      items: {
        include: {
          lot: {
            select: { code: true, stage: true, stageCode: true, quantity: true, plantTypeId: true, plantType: { select: { code: true, name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(transfers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { toRoomId, toUserId, notes, items } = parsed.data;
  let { toWarehouseId } = parsed.data;

  // Nếu chọn phòng đích (vd: phòng tối), suy ra kho chứa phòng đó
  if (toRoomId) {
    const toRoom = await prisma.room.findUnique({ where: { id: toRoomId } });
    if (!toRoom) return NextResponse.json({ message: "Không tìm thấy phòng đích" }, { status: 400 });
    toWarehouseId = toRoom.warehouseId;
  }

  // Lấy warehouse/room nguồn từ lot đầu tiên — Phòng tối cá nhân giờ gắn thẳng qua Lot.roomId (không
  // qua kệ), nên chỉ còn lô ở Kho sáng (Phòng mẫu mẹ/ra rễ) mới cần suy ra từ shelf.
  const firstLot = await prisma.lot.findUnique({
    where: { id: items[0].lotId },
    include: {
      room: { include: { warehouse: true } },
      shelf: { include: { warehouse: true, room: true } },
    },
  });

  const fromWarehouseId = firstLot?.room?.warehouseId ?? firstLot?.shelf?.warehouseId ?? null;
  const fromRoomId = firstLot?.roomId ?? firstLot?.shelf?.roomId ?? null;
  const isFromDarkRoom = firstLot?.room?.type === "PHONG_TOI" || firstLot?.shelf?.room?.type === "PHONG_TOI";
  const isFromRootingRoom = firstLot?.shelf?.room?.type === "PHONG_RA_RE";

  // Không chọn đích cụ thể (VD: gửi từ phòng tối, để hệ thống tự chỉ định kệ lúc xác nhận) → mặc định
  // cùng kho sản xuất với nguồn.
  if (!toWarehouseId) toWarehouseId = fromWarehouseId ?? undefined;
  if (!toWarehouseId) {
    return NextResponse.json({ message: "Cần chọn kho hoặc phòng đích" }, { status: 400 });
  }

  // Bàn giao từ phòng tối cá nhân → bắt buộc mọi lô đã "Đã kiểm tra" nhiễm trước khi bàn giao. Đồng thời
  // validate "không đạt" NV tự khai (chỉ cho lô thành phẩm T01/T05, không cho mẫu mẹ — mẫu mẹ luôn đạt
  // hết) — không vượt quá số lượng đang bàn giao của đúng lô đó.
  if (isFromDarkRoom) {
    const lots = await prisma.lot.findMany({
      where: { id: { in: items.map((i) => i.lotId) } },
      select: { id: true, inspectedAt: true, stage: true },
    });
    if (lots.some((lot) => !lot.inspectedAt)) {
      return NextResponse.json({ message: "Cần kiểm tra nhiễm trước khi bàn giao" }, { status: 400 });
    }
    const lotById = new Map(lots.map((l) => [l.id, l]));
    for (const item of items) {
      if (item.unqualifiedQuantity <= 0) continue;
      const lot = lotById.get(item.lotId);
      if (lot?.stage !== "THANH_PHAM") {
        return NextResponse.json({ message: "Chỉ được khai \"không đạt\" cho lô thành phẩm, không áp dụng cho mẫu mẹ" }, { status: 400 });
      }
      if (item.unqualifiedQuantity > item.quantity) {
        return NextResponse.json({ message: "Số lượng không đạt không được vượt quá số lượng bàn giao" }, { status: 400 });
      }
    }
  }

  // Chặn bàn giao trùng — lô đã có phiếu PENDING khác (VD F5 lại trang trước khi danh sách kịp lọc,
  // hoặc bấm 2 lần/2 tab) thì không cho tạo phiếu thứ 2 cho cùng lô đó. Check + tạo phiếu gộp trong 1
  // transaction mức cô lập Serializable — 2 request gần như đồng thời cùng đọc "chưa có phiếu PENDING"
  // sẽ khiến Postgres tự huỷ 1 trong 2 (lỗi write conflict), thay vì cả 2 cùng lọt qua như khi check và
  // tạo là 2 câu lệnh tách rời (round-trip riêng, không có gì khoá giữa chừng).
  let transfer;
  try {
    transfer = await prisma.$transaction(
      async (tx) => {
        // Khoá "1 phiếu bàn giao tại 1 thời điểm" cho mỗi NV cấy mô — chỉ áp dụng bàn giao SẢN PHẨM từ
        // Phòng tối (không áp dụng bàn giao thành phẩm từ Phòng ra rễ, vốn do KHO_MO/KHO_THANH_PHAM tự
        // thao tác; cũng KHÔNG tính phiếu bàn giao MM dư — notes=SURPLUS_TRANSFER_TAG — vì phiếu đó xử lý
        // ở luồng riêng, xếp thẳng vào Kho quá hạn, không qua hàng chờ "sắp xếp về kho" hàng ngày, giữ
        // đồng bộ với findPendingItems/do-lane đã loại surplus khỏi danh sách chờ tương tự). Còn phiếu cũ
        // nào của đúng NV này CHƯA được Kho mô sắp xếp xong hết (còn TransferItem nào confirmedAt = null,
        // kể cả đã kiểm tra nhiễm xong nhưng chưa xếp kệ) thì chặn không cho gửi phiếu mới — buộc Kho mô
        // xử lý lần lượt từng phiếu, không bị dồn nhiều phiếu treo cùng lúc.
        if (isFromDarkRoom) {
          const oldPending = await tx.transfer.findFirst({
            where: {
              fromUserId: session.user.id,
              status: "PENDING",
              fromRoom: { type: "PHONG_TOI" },
              OR: [{ notes: null }, { notes: { not: SURPLUS_TRANSFER_TAG } }],
              items: { some: { confirmedAt: null } },
            },
            select: { id: true },
          });
          if (oldPending) {
            throw new PendingOldHandoverError("Bạn cần đợi Quản lý kho mô sắp xếp xong lô cũ, hãy quay lại sau.");
          }
        }

        const alreadyPending = await tx.transferItem.findFirst({
          where: { lotId: { in: items.map((i) => i.lotId) }, transfer: { status: "PENDING" } },
          select: { lot: { select: { code: true } } },
        });
        if (alreadyPending) {
          throw new DuplicateTransferError(
            `Lô ${alreadyPending.lot.code} đã có phiếu bàn giao đang chờ xác nhận, không thể bàn giao trùng`
          );
        }

        const code = await generateTransferCode(tx);
        return tx.transfer.create({
          data: {
            code,
            fromWarehouseId,
            fromRoomId,
            toWarehouseId,
            toRoomId,
            fromUserId: session.user.id,
            toUserId,
            notes,
            items: { create: items },
          },
          include: {
            items: { include: { lot: true } },
            toWarehouse: true,
            toRoom: true,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err) {
    if (err instanceof DuplicateTransferError || err instanceof PendingOldHandoverError) {
      return NextResponse.json({ message: err.message }, { status: 409 });
    }
    // Postgres huỷ 1 trong 2 transaction đụng nhau (write conflict) — báo lỗi rõ ràng để client thử lại,
    // thay vì để lộ lỗi 500 chung chung.
    if (isSerializationFailure(err)) {
      return NextResponse.json(
        { message: "Có người khác vừa bàn giao cùng lúc, vui lòng thử lại" },
        { status: 409 }
      );
    }
    throw err;
  }

  // Bàn giao từ Phòng tối → thông báo cho KHO_MO có phiếu chờ nhận.
  if (isFromDarkRoom) {
    await createAlert({
      type: "LOT_READY_TRANSFER",
      title: "Có phiếu bàn giao từ phòng tối chờ nhận",
      message: `${session.user.name} đã gửi phiếu ${transfer.code} — ${items.length} lô từ phòng tối, chờ xác nhận nhập kho`,
      targetRole: "KHO_MO",
      relatedId: transfer.id,
      relatedType: "Transfer",
    });
  }

  // Bàn giao thành phẩm từ Phòng ra rễ → thông báo cho Kho thành phẩm có phiếu chờ nhận.
  if (isFromRootingRoom) {
    await createAlert({
      type: "LOT_READY_TRANSFER",
      title: "Có phiếu bàn giao thành phẩm chờ nhận",
      message: `${session.user.name} đã gửi phiếu ${transfer.code} — ${items.length} lô thành phẩm, chờ xác nhận nhập kho`,
      targetRole: "KHO_THANH_PHAM",
      relatedId: transfer.id,
      relatedType: "Transfer",
    });
  }

  return NextResponse.json(transfer, { status: 201 });
}
