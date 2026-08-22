import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getAccessibleRoomIds, getInProgressRoomIds, getQualifiedLots, parseBagSize } from "@/lib/order-availability";
import { canActAsSale } from "@/types";
import { z } from "zod";

// T10 (túi 10 cây) chỉ phát sinh trong Kho thành phẩm (đóng gói lại từ T01/T05, không sản xuất trực
// tiếp từ Phòng ra rễ) — vẫn hợp lệ ở đây vì Sale chỉ bao giờ tham chiếu tồn kho trong Phòng đạt tiêu
// chuẩn/Phòng thị trường (xem getAccessibleRoomIds), không đụng tới phía sản xuất.
const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

const checkSchema = z.object({
  // Ngày xuất dự kiến — quyết định lô "ảo" nào (Kế hoạch nhập kho chưa về, xem
  // src/lib/order-availability.ts) được tính vào khả dụng cùng tồn thật.
  expectedShipAt: z.string().min(1, "Cần chọn ngày xuất dự kiến"),
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

type QualifiedLot = Awaited<ReturnType<typeof getQualifiedLots>>[number];

type Alternative = {
  stageCode: string;
  available: number;
  suggestedQty: number;
  surplusQuantity: number;
  // true = cần Kho thành phẩm xử lý (mở túi lớn hơn hoặc chuyển từ Kho hàn túi/Theo dõi) trước khi
  // dùng được cho đơn — sinh Yêu cầu xử lý cây lúc Sale "Xác nhận" (xem confirmOrder). false = quy cách
  // T01 rời trong CHÍNH Phòng đạt tiêu chuẩn, dùng được ngay không cần xử lý gì thêm.
  requiresProcessing: boolean;
  // Nguồn của đề xuất — hiển thị khác nhau ở UI và quyết định phòng nguồn lúc giữ đơn.
  source: "DAT_TIEU_CHUAN" | "HAN_TUI_THEO_DOI";
  usesPlannedStock: boolean;
  plannedDate: string | null;
  // Phần dự phòng hao hụt 5% (nếu có) ĐÃ được cộng sẵn vào surplusQuantity ở trên — field này chỉ để
  // hiển thị minh bạch cho Sale, không dùng để tính toán thêm gì (xem applyConversionBuffer).
  bufferQuantity: number;
};

const earliestPlannedDate = (lots: { planned?: boolean; expectedDate?: Date }[]) =>
  lots.filter((l) => l.planned && l.expectedDate).map((l) => l.expectedDate!).sort((a, b) => a.getTime() - b.getTime())[0]?.toISOString() ?? null;

// Đề xuất quy cách KHÁC quy cách đang thiếu, trong 1 tập lô cho trước (Phòng đạt tiêu chuẩn hoặc Kho hàn
// túi/Theo dõi) — ưu tiên quy cách GẦN quy cách đang thiếu nhất trước (VD thiếu T05 thì đề xuất T01
// trước T10) để giảm chênh lệch túi phải mở, dừng ngay khi đã bù đủ phần thiếu. forceProcessing = true
// nghĩa là MỌI đề xuất từ tập lô này đều cần xử lý dù quy cách gì (dùng cho Kho hàn túi/Theo dõi — luôn
// cần chuyển phòng, khác Phòng đạt tiêu chuẩn chỉ cần xử lý khi quy cách túi >1 cây phải mở).
function computeCrossStageAlternatives(
  lots: QualifiedLot[],
  demandStageCode: string,
  remainingIn: number,
  source: Alternative["source"],
  forceProcessing: boolean
): { alternatives: Alternative[]; remaining: number } {
  const byStage = new Map<string, QualifiedLot[]>();
  for (const l of lots) {
    if (l.stageCode === demandStageCode) continue;
    const arr = byStage.get(l.stageCode) ?? [];
    arr.push(l);
    byStage.set(l.stageCode, arr);
  }
  const demandBagSize = parseBagSize(demandStageCode);
  const sorted = Array.from(byStage.entries()).sort(
    (a, b) => Math.abs(parseBagSize(a[0]) - demandBagSize) - Math.abs(parseBagSize(b[0]) - demandBagSize)
  );

  const alternatives: Alternative[] = [];
  let remaining = remainingIn;
  for (const [stageCode, stageLots] of sorted) {
    if (remaining <= 0) break;
    const available = stageLots.reduce((s, l) => s + l.available, 0);
    const bagSize = parseBagSize(stageCode) || 1;
    // Quy cách túi >1 cây không thể xé lẻ — phải mở nguyên túi để bù đủ phần thiếu, số dư (nếu mở dư
    // ra) trả về dạng T01 rời (giống cơ chế Yêu cầu xử lý cây ở PATCH /api/orders/[id] confirm).
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
    alternatives.push({
      stageCode, available, suggestedQty, surplusQuantity,
      requiresProcessing: forceProcessing || bagSize > 1,
      source,
      usesPlannedStock: stageLots.some((l) => l.planned),
      plannedDate: earliestPlannedDate(stageLots),
      bufferQuantity: 0,
    });
    remaining -= suggestedQty;
  }
  return { alternatives, remaining };
}

// Dự phòng hao hụt khi tách/mở túi lớn hơn sang quy cách khác — CHỈ áp dụng cho tier 2 (quy đổi quy
// cách trong Phòng đạt tiêu chuẩn), KHÔNG áp dụng cho tier 3 (Kho hàn túi/Theo dõi — đó là chuyển phòng,
// không phải thao tác tách túi có rủi ro hao hụt tương tự). Dự phòng = 5% × tổng số cây thực cần quy đổi
// (tổng suggestedQty của mọi đề xuất tier 2 được chấp nhận), làm tròn lên theo cỡ túi của đề xuất CUỐI
// CÙNG có mở túi (bagSize > 1) trong danh sách — nếu không đề xuất nào mở túi (toàn bộ đều là T01, không
// có rủi ro tách túi) thì không có dự phòng. Cộng dồn vào surplusQuantity của đúng đề xuất đó, giới hạn
// không vượt quá phần còn trống (available) của đề xuất đó.
function applyConversionBuffer(alternatives: Alternative[]): void {
  const tier2 = alternatives.filter((a) => a.source === "DAT_TIEU_CHUAN" && a.suggestedQty > 0);
  if (tier2.length === 0) return;
  const totalConverted = tier2.reduce((s, a) => s + a.suggestedQty, 0);

  const processingAlts = tier2.filter((a) => a.requiresProcessing);
  if (processingAlts.length === 0) return; // toàn bộ đề xuất là T01, không có thao tác mở túi nào
  const last = processingAlts[processingAlts.length - 1];

  const lastBagSize = parseBagSize(last.stageCode) || 1;
  const bufferWanted = Math.ceil((totalConverted * 0.05) / lastBagSize) * lastBagSize;
  const room = Math.max(0, last.available - last.suggestedQty - last.surplusQuantity);
  const bufferQuantity = Math.min(bufferWanted, room);
  if (bufferQuantity <= 0) return;

  last.surplusQuantity += bufferQuantity;
  last.bufferQuantity = bufferQuantity;
}

// Tính thử khả năng đáp ứng đơn hàng — KHÔNG ghi gì vào DB, đọc tồn theo 3 tầng ưu tiên: (1) Phòng đạt
// tiêu chuẩn đúng quy cách, (2) Phòng đạt tiêu chuẩn quy cách thay thế, (3) Kho hàn túi/Theo dõi (đúng
// quy cách rồi thay thế — chưa đạt chuẩn/chưa đóng gói, cần Kho thành phẩm xử lý trước khi bán được).
// Xem src/lib/order-availability.ts.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canActAsSale(session.user.role)) {
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

  const shipDate = new Date(parsed.data.expectedShipAt);
  if (Number.isNaN(shipDate.getTime())) {
    return NextResponse.json({ message: "Ngày xuất dự kiến không hợp lệ" }, { status: 400 });
  }

  const roomIds = await getAccessibleRoomIds(session.user.id, session.user.workplaceWarehouseId);
  const inProgressRoomIds = await getInProgressRoomIds(session.user.workplaceWarehouseId);
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

    // Tầng 1: Phòng đạt tiêu chuẩn, đúng quy cách.
    const primaryLots = await getQualifiedLots(roomIds, item.plantTypeId, item.stageCode, prisma, { shipDate });
    const availableAtStage = primaryLots.reduce((s, l) => s + l.available, 0);
    const fulfilledAtStage = Math.min(availableAtStage, item.quantity);
    let remaining = item.quantity - fulfilledAtStage;
    const usesPlannedStock = primaryLots.some((l) => l.planned);
    const plannedDate = earliestPlannedDate(primaryLots);

    let alternatives: Alternative[] = [];

    // Tầng 2: Phòng đạt tiêu chuẩn, quy cách thay thế.
    if (remaining > 0) {
      const otherLots = await getQualifiedLots(roomIds, item.plantTypeId, undefined, prisma, { shipDate });
      const tier2 = computeCrossStageAlternatives(otherLots, item.stageCode, remaining, "DAT_TIEU_CHUAN", false);
      applyConversionBuffer(tier2.alternatives);
      alternatives = alternatives.concat(tier2.alternatives);
      remaining = tier2.remaining;
    }

    // Tầng 3a: Kho hàn túi/Theo dõi, ĐÚNG quy cách — chỉ cần chuyển phòng, không cần mở/quy đổi túi.
    if (remaining > 0 && inProgressRoomIds.length > 0) {
      const exactLots = await getQualifiedLots(inProgressRoomIds, item.plantTypeId, item.stageCode, prisma, { shipDate });
      const exactAvailable = exactLots.reduce((s, l) => s + l.available, 0);
      if (exactAvailable > 0) {
        const suggestedQty = Math.min(exactAvailable, remaining);
        alternatives.push({
          stageCode: item.stageCode,
          available: exactAvailable,
          suggestedQty,
          surplusQuantity: 0,
          requiresProcessing: true,
          source: "HAN_TUI_THEO_DOI",
          usesPlannedStock: exactLots.some((l) => l.planned),
          plannedDate: earliestPlannedDate(exactLots),
          bufferQuantity: 0,
        });
        remaining -= suggestedQty;
      }
    }

    // Tầng 3b: Kho hàn túi/Theo dõi, quy cách thay thế.
    if (remaining > 0 && inProgressRoomIds.length > 0) {
      const otherLots3 = await getQualifiedLots(inProgressRoomIds, item.plantTypeId, undefined, prisma, { shipDate });
      const tier3b = computeCrossStageAlternatives(otherLots3, item.stageCode, remaining, "HAN_TUI_THEO_DOI", true);
      alternatives = alternatives.concat(tier3b.alternatives);
      remaining = tier3b.remaining;
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
      usesPlannedStock,
      plannedDate,
      alternatives,
      totalFulfilled,
    });
  }

  return NextResponse.json({ results });
}
