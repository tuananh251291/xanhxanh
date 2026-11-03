import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewFinishedHandoverHistory, computeFinishedHandoverHistory, resolveFinishedHistoryScope } from "@/lib/finished-handover-history";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewFinishedHandoverHistory(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const scope = resolveFinishedHistoryScope(role, session?.user?.workplaceWarehouseId, sp.get("toWarehouseId"));
  if (!scope) return NextResponse.json({ rows: [] });

  const rows = await computeFinishedHandoverHistory({
    dateFrom: sp.get("dateFrom"),
    dateTo: sp.get("dateTo"),
    sourceWarehouseId: sp.get("sourceWarehouseId"),
    status: sp.get("status"),
    ...scope,
  });
  return NextResponse.json({ rows });
}
