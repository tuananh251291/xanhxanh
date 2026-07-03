import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import MediumReceiveBoard from "./medium-receive-board";

export default async function MediumReceivePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/medium/receive"))) redirect("/dashboard");

  return <MediumReceiveBoard />;
}
