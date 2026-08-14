import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import SuppliersContent from "./suppliers-content";

export default async function SuppliersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/suppliers"))) redirect("/dashboard");
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  return <SuppliersContent />;
}
