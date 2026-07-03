import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import TransferSendForm from "./transfer-send-form";

export default async function TransferSendPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/send"))) redirect("/dashboard");

  return <TransferSendForm role={role as UserRole} />;
}
