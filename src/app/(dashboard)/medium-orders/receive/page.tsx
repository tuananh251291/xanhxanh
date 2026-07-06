import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import MediumOrdersReceiveBoard from "./medium-orders-receive-board";

export default async function MediumOrdersReceivePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/medium-orders/receive"))) redirect("/dashboard");

  return <MediumOrdersReceiveBoard />;
}
