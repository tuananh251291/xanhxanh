import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canApprovePriceList, canViewPriceList } from "@/lib/price-list";
import PriceListDetail from "./price-list-detail";

export default async function PriceListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewPriceList(role)) redirect("/dashboard");
  const { id } = await params;
  return <PriceListDetail id={id} canApprove={canApprovePriceList(role)} />;
}
