import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { isAdminRole } from "@/types";
import VarietyDetailBoard from "./variety-detail-board";

export default async function TrialVarietyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  const { id } = await params;
  if (!id) notFound();

  return <VarietyDetailBoard varietyId={id} />;
}
