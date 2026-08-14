import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import MaterialsContent from "./materials-content";

export default async function MaterialsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/materials"))) redirect("/dashboard");
  if (role !== "MOI_TRUONG" && role !== "SUPER_ADMIN" && role !== "ADMIN") redirect("/dashboard");

  return <MaterialsContent role={role} />;
}
