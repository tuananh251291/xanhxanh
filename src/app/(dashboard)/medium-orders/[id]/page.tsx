import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MediumOrderDetail from "./medium-order-detail";

export default async function MediumOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return <MediumOrderDetail orderId={id} role={session.user.role ?? null} />;
}
