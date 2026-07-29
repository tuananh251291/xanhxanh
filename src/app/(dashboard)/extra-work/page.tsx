import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ExtraWorkRequestForm from "@/components/shared/extra-work-request-form";

export default async function ExtraWorkPage() {
  const session = await auth();
  if (!session?.user || !(await isPageAllowed(session.user.role, "/extra-work"))) redirect("/dashboard");
  if (session.user.role !== "CAY_MO") redirect("/dashboard");

  return (
    <div className="max-w-3xl mx-auto">
      <ExtraWorkRequestForm />
    </div>
  );
}
