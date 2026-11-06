import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/types";
import ProbationEvaluationForm from "./probation-evaluation-form";

export default async function ProbationEvaluationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user) redirect("/login");
  if (role !== "CAY_MO" && role !== "KY_THUAT" && !isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") redirect("/dashboard");

  const { id } = await params;
  const { print } = await searchParams;
  return <ProbationEvaluationForm evaluationId={id} viewerRole={role} autoPrint={print === "1"} />;
}
