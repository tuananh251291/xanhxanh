import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import MotherReadyBoard from "./mother-ready-board";

export default async function MotherReadyPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/mother-ready"))) redirect("/dashboard");

  return <MotherReadyBoard />;
}
