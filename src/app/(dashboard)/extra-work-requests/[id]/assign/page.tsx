import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import AssignWorkChoice from "./assign-work-choice";

export default async function AssignExtraWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/extra-work-requests"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  const { id } = await params;
  const request = await prisma.extraWorkRequest.findUnique({
    where: { id },
    include: {
      staff: { select: { name: true, code: true, workplaceWarehouseId: true } },
      instruction: { select: { code: true } },
    },
  });
  if (!request) notFound();
  if (role === "KHO_MO" && request.staff.workplaceWarehouseId !== session!.user.workplaceWarehouseId) {
    redirect("/extra-work-requests");
  }
  if (request.status !== "APPROVED" || request.fulfilledAt) {
    redirect("/extra-work-requests");
  }

  return (
    <AssignWorkChoice
      requestId={request.id}
      staffName={request.staff.name}
      staffCode={request.staff.code}
      requestType={request.type}
      instructionCode={request.instruction?.code ?? null}
    />
  );
}
