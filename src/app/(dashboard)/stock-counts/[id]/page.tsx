import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { canDecideStockCount, canEditStockCount, canViewStockCount } from "@/lib/stock-count-shared";
import StockCountDetail from "./stock-count-detail";

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/stock-counts"))) redirect("/dashboard");
  if (!canViewStockCount(role)) redirect("/dashboard");
  const { id } = await params;
  return <StockCountDetail id={id} canEdit={canEditStockCount(role)} canDecide={canDecideStockCount(role)} />;
}
