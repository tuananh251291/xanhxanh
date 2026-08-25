import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import MediumOrdersList from "./medium-orders-list";
import ProcessingMediumOrdersList from "./processing-medium-orders-list";

export default async function MediumOrdersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/medium-orders"))) redirect("/dashboard");

  return (
    <div className="space-y-10">
      <MediumOrdersList canConfirm={role === "MOI_TRUONG"} currentUserId={session?.user?.id ?? null} />
      {(role === "MOI_TRUONG" || isAdminRole(role)) && (
        <ProcessingMediumOrdersList canComplete={role === "MOI_TRUONG"} />
      )}
    </div>
  );
}
