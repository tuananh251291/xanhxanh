import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import MarketExportBoard from "./market-export-board";

export default async function MarketExportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "DOI_TAC_VAN_HANH" && !isAdminRole(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/market-export"))) redirect("/dashboard");

  return <MarketExportBoard />;
}
