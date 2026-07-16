import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getAccessibleRoomIds, getAvailableLots, parseBagSize } from "@/lib/order-availability";
import { z } from "zod";

// T10 (túi 10 cây) chỉ phát sinh trong Kho thành phẩm (đóng gói lại từ T01/T05, không sản xuất trực
// tiếp từ Phòng ra rễ) — vẫn hợp lệ ở đây vì Sale chỉ bao giờ tham chiếu tồn kho trong Phòng khả
// dụng/Phòng thị trường (xem getAccessibleRoomIds), không đụng tới phía sản xuất.
const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

const checkSchema = z.object({
  items: z
    .array(
      z.object({
        plantTypeId: z.string(),
        stageCode: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "Cần ít nhất 1 dòng nhu cầu"),
});

// Tính thử khả năng đáp ứng đơn hàng — KHÔNG ghi gì vào DB, chỉ đọc tồn khả dụng hiện tại (Phòng khả
// dụng của kho được gán + Phòng thị trường được cấp quyền, xem src/lib/order-availability.ts) để Sale
// xem trước khi quyết định "Tạm giữ đơn hàng" (POST /api/orders).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được chức năng này" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  for (const item of parsed.data.items) {
    if (!FINISHED_STAGE_CODES.has(item.stageCode)) {
      return NextResponse.json({ message: `Quy cách "${item.stageCode}" không hợp lệ (T01/T05/T10)` }, { status: 400 });
    }
  }

  const roomIds = await getAccessibleRoomIds(session.user.id, session.user.workplaceWarehouseId);
  const plantTypeIds = Array.from(new Set(parsed.data.items.map((i) => i.plantTypeId)));
  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: plantTypeIds } },
    select: { id: true, code: true, name: true },
  });
  const plantTypeById = new Map(plantTypes.map((p) => [p.id, p]));

  const results = [];
  for (const item of parsed.data.items) {
    const plantType = plantTypeById.get(item.plantTypeId);
    if (!plantType) {
      return NextResponse.json({ message: `Không tìm thấy mã cây` }, { status: 400 });
    }

    const primaryLots = await getAvailableLots(roomIds, item.plantTypeId, item.stageCode);
    const availableAtStage = primaryLots.reduce((s, l) => s + l.available, 0);
    const fulfilledAtStage = Math.min(availableAtStage, item.quantity);
    let remaining = item.quantity - fulfilledAtStage;

    const alternatives: { stageCode: string; available: number; suggestedQty: number; surplusQuantity: number }[] = [];
    if (remaining > 0) {
      // Quy cách khác của CÙNG loại cây còn tồn trong phạm vi được xem — ưu tiên quy cách GẦN quy cách
      // đang thiếu nhất trước (VD thiếu T05 thì đề xuất T01 trước T10, thiếu T10 thì đề xuất T05 trước
      // T01) để giảm chênh lệch túi phải mở, dừng ngay khi đã bù đủ phần thiếu.
      const otherLots = await getAvailableLots(roomIds, item.plantTypeId);
      const byStage = new Map<string, number>();
      for (const l of otherLots) {
        if (l.stageCode === item.stageCode) continue;
        byStage.set(l.stageCode, (byStage.get(l.stageCode) ?? 0) + l.available);
      }
      const demandBagSize = parseBagSize(item.stageCode);
      const sortedAlternatives = Array.from(byStage.entries()).sort(
        (a, b) => Math.abs(parseBagSize(a[0]) - demandBagSize) - Math.abs(parseBagSize(b[0]) - demandBagSize)
      );
      for (const [stageCode, available] of sortedAlternatives) {
        if (remaining <= 0) break;
        const bagSize = parseBagSize(stageCode) || 1;
        // Quy cách túi >1 cây không thể xé lẻ — phải mở nguyên túi để bù đủ phần thiếu, số dư (nếu mở
        // dư ra) trả về dạng T01 rời (giống cơ chế Yêu cầu xử lý cây ở PATCH /api/orders/[id] confirm).
        let suggestedQty: number;
        let surplusQuantity: number;
        if (bagSize <= 1) {
          suggestedQty = Math.min(available, remaining);
          surplusQuantity = 0;
        } else {
          const desiredDeduct = Math.ceil(remaining / bagSize) * bagSize;
          const actualDeduct = Math.min(available, desiredDeduct);
          suggestedQty = Math.min(actualDeduct, remaining);
          surplusQuantity = actualDeduct - suggestedQty;
        }
        if (suggestedQty <= 0 && surplusQuantity <= 0) continue;
        alternatives.push({ stageCode, available, suggestedQty, surplusQuantity });
        remaining -= suggestedQty;
      }
    }

    const totalFulfilled = fulfilledAtStage + alternatives.reduce((s, a) => s + a.suggestedQty, 0);

    results.push({
      plantTypeId: item.plantTypeId,
      plantTypeCode: plantType.code,
      plantTypeName: plantType.name,
      stageCode: item.stageCode,
      quantityDemand: item.quantity,
      availableAtStage,
      fulfilledAtStage,
      alternatives,
      totalFulfilled,
    });
  }

  return NextResponse.json({ results });
}
