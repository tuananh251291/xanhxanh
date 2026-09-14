import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isKhoThanhPhamRole, isAdminRole } from "@/types";
import SendMarketForm from "./send-market-form";

export default async function SendMarketPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isKhoThanhPhamRole(role) && !isAdminRole(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/transfers/send-market"))) redirect("/dashboard");

  return <SendMarketForm />;
}
