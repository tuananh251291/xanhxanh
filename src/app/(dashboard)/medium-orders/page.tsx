import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import MediumOrdersList from "./medium-orders-list";

export default async function MediumOrdersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/medium-orders"))) redirect("/dashboard");

  return <MediumOrdersList canConfirm={role === "MOI_TRUONG"} currentUserId={session?.user?.id ?? null} />;
}
