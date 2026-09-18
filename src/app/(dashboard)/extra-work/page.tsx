import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ExtraWorkRequestForm from "@/components/shared/extra-work-request-form";

export default async function ExtraWorkPage() {
  const session = await auth();
  if (!session?.user || !(await isPageAllowed(session.user.role, "/extra-work"))) redirect("/dashboard");
  if (session.user.role !== "CAY_MO") redirect("/dashboard");

  const staff = await prisma.user.findUnique({ where: { id: session.user.id }, select: { inspectionLane: true } });

  return (
    <div className="max-w-3xl mx-auto">
      <ExtraWorkRequestForm inspectionLane={staff?.inspectionLane ?? null} />
    </div>
  );
}
