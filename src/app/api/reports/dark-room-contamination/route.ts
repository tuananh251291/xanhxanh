import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";
import { startOfDay, endOfDay, subDays, parseISO, isValid, format } from "date-fns";

// Báo cáo "Tỉ lệ nhiễm phòng tối" — TÁCH 2 tỉ lệ riêng theo đúng 2 mốc kiểm tra khác nhau:
// 1. Tự phát hiện: NV cấy mô tự kiểm tra sau đủ ngày ủ tối thiểu (LotInspection/LotInspectionItem,
//    trang Kiểm tra nhiễm — dashboard-basic/kiem-tra-nhiem).
// 2. Luồng Đỏ phát hiện thêm: Kho mô kiểm tra lại lúc nhận bàn giao, CHỈ áp dụng NV luồng Đỏ/chưa cài
//    đặt luồng (User.inspectionLane khác "XANH") — TransferInspection/TransferInspectionItem, xem
//    api/transfers/receive-phong-toi/inspect/[transferId]/route.ts. Khớp với từng LotInspectionItem qua
//    lotId → TransferItem → Transfer → TransferInspection, so khớp theo stageCode — CỘNG DỒN mọi dòng
//    TransferInspectionItem cùng stageCode (1 phiếu có thể có nhiều dòng, mỗi dòng 1 mã cây, xem schema),
//    không lấy dòng đầu tiên khớp.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/reports"))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const staffIds = Array.from(
    new Set((searchParams.get("staffIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  );
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const parsedFrom = fromParam ? parseISO(fromParam) : null;
  const parsedTo = toParam ? parseISO(toParam) : null;
  const from = parsedFrom && isValid(parsedFrom) ? startOfDay(parsedFrom) : startOfDay(subDays(new Date(), 14));
  const to = parsedTo && isValid(parsedTo) ? endOfDay(parsedTo) : endOfDay(new Date());

  const inspections = await prisma.lotInspection.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(staffIds.length > 0 ? { staffId: { in: staffIds } } : {}),
    },
    select: {
      createdAt: true,
      staffId: true,
      staff: { select: { name: true, inspectionLane: true } },
      items: { select: { lotId: true, stageCode: true, initialQuantity: true, contaminatedQuantity: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const lotIds = inspections.flatMap((insp) => insp.items.map((i) => i.lotId));
  const transferItems = lotIds.length
    ? await prisma.transferItem.findMany({
        where: { lotId: { in: lotIds } },
        select: {
          lotId: true,
          transfer: {
            select: {
              inspection: {
                select: { items: { select: { stageCode: true, contaminatedQuantity: true, handedOverQuantity: true } } },
              },
            },
          },
        },
      })
    : [];
  // 1 lô chỉ thuộc đúng 1 phiếu bàn giao — map thẳng lotId -> danh sách item kiểm tra luồng Đỏ (theo
  // stageCode) của phiếu đó, null nếu chưa bàn giao hoặc chưa được Kho mô kiểm tra.
  const redFlowItemsByLotId = new Map(
    transferItems.map((ti) => [ti.lotId, ti.transfer.inspection?.items ?? null])
  );

  type DayBucket = {
    date: string;
    totalCreated: number;
    selfContaminated: number;
    redFlowHandedOver: number;
    redFlowContaminated: number;
    redFlowApplicableCount: number;
  };
  const byDay = new Map<string, DayBucket>();

  for (const insp of inspections) {
    const dateKey = format(insp.createdAt, "yyyy-MM-dd");
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, {
        date: dateKey,
        totalCreated: 0,
        selfContaminated: 0,
        redFlowHandedOver: 0,
        redFlowContaminated: 0,
        redFlowApplicableCount: 0,
      });
    }
    const bucket = byDay.get(dateKey)!;
    const redFlowApplicable = insp.staff.inspectionLane !== "XANH";

    for (const item of insp.items) {
      bucket.totalCreated += item.initialQuantity;
      bucket.selfContaminated += item.contaminatedQuantity;

      if (!redFlowApplicable) continue;
      bucket.redFlowApplicableCount += 1;
      const redFlowItems = redFlowItemsByLotId.get(item.lotId);
      const matches = redFlowItems?.filter((r) => r.stageCode === item.stageCode) ?? [];
      for (const match of matches) {
        bucket.redFlowHandedOver += match.handedOverQuantity;
        bucket.redFlowContaminated += match.contaminatedQuantity;
      }
    }
  }

  const rows = Array.from(byDay.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({
      ...b,
      selfRatePct: b.totalCreated > 0 ? Math.round((b.selfContaminated / b.totalCreated) * 1000) / 10 : 0,
      redFlowRatePct: b.redFlowHandedOver > 0 ? Math.round((b.redFlowContaminated / b.redFlowHandedOver) * 1000) / 10 : 0,
    }));

  const totalCreated = rows.reduce((s, r) => s + r.totalCreated, 0);
  const selfContaminated = rows.reduce((s, r) => s + r.selfContaminated, 0);
  const redFlowHandedOver = rows.reduce((s, r) => s + r.redFlowHandedOver, 0);
  const redFlowContaminated = rows.reduce((s, r) => s + r.redFlowContaminated, 0);

  return NextResponse.json({
    rows,
    summary: {
      totalCreated,
      selfContaminated,
      selfRatePct: totalCreated > 0 ? Math.round((selfContaminated / totalCreated) * 1000) / 10 : 0,
      redFlowHandedOver,
      redFlowContaminated,
      redFlowRatePct: redFlowHandedOver > 0 ? Math.round((redFlowContaminated / redFlowHandedOver) * 1000) / 10 : 0,
    },
  });
}
