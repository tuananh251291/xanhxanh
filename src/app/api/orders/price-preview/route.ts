import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canActAsSale } from "@/types";
import { priceOrderLines, summarizeOrderPrices } from "@/lib/order-price-engine";
import { resolveOrderPriceList } from "@/lib/order-pricing";

const schema = z.object({
  marketId: z.string().min(1),
  items: z.array(z.object({
    plantTypeId: z.string(), stageCode: z.string(), quantity: z.number().int().positive(),
    neededQuantity: z.number().int().min(0).optional(), demandStageCode: z.string().optional(),
  })).min(1).max(500),
});

// Xem trước giá lúc tạo đơn theo bảng giá đang áp dụng của thị trường. Không lưu gì — giá thật chốt ở POST /api/orders.
// priced=false (thị trường không dùng bảng giá) trả null để form không hiện bảng giá.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canActAsSale(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { marketId, items } = parsed.data;

  const pricing = await resolveOrderPriceList(marketId);
  if (!pricing.priced) return NextResponse.json(null);

  const lines = items.map((i) => ({ plantTypeId: i.plantTypeId, stageCode: i.demandStageCode ?? i.stageCode, quantity: i.neededQuantity ?? i.quantity }));
  const prices = priceOrderLines(pricing.list, lines);
  const plants = new Map(
    (await prisma.plantType.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.plantTypeId))] } }, select: { id: true, code: true, name: true } })).map((p) => [p.id, p])
  );
  return NextResponse.json(summarizeOrderPrices(
    { currency: pricing.list?.currency ?? null, effectiveFrom: pricing.effectiveFrom },
    lines.map((l, i) => ({
      plantTypeCode: plants.get(l.plantTypeId)?.code ?? "?", plantTypeName: plants.get(l.plantTypeId)?.name ?? "", stageCode: l.stageCode, quantity: l.quantity,
      unitPrice: prices[i].unitPrice, tier: prices[i].tier, issue: prices[i].issue, manual: false,
    }))
  ));
}
