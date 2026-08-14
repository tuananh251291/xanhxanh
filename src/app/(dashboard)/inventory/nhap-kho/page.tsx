import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import NhapKhoContent from "./nhap-kho-content";

export default async function NhapKhoPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/nhap-kho"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  return <NhapKhoContent role={role} workplaceWarehouseId={session!.user.workplaceWarehouseId} />;
}
