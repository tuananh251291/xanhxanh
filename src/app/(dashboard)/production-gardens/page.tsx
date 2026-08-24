import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ProductionGardensContent from "./production-gardens-content";

export default async function ProductionGardensPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/production-gardens"))) redirect("/dashboard");
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  return <ProductionGardensContent />;
}
