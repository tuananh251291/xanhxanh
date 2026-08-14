import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import WarehousesContent from "./warehouses-content";

export default async function WarehousesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/warehouses"))) redirect("/dashboard");

  return <WarehousesContent role={role} />;
}
