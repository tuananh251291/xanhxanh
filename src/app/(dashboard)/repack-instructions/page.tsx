import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import RepackInstructionsBoard from "./repack-instructions-board";

export default async function RepackInstructionsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/repack-instructions"))) redirect("/dashboard");
  if (role !== "KY_THUAT" && role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  return (
    <RepackInstructionsBoard
      role={role!}
      userId={session!.user.id}
      workplaceWarehouseId={session!.user.workplaceWarehouseId}
    />
  );
}
