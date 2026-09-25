import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import RejectClassificationListBoard from "./reject-classification-list-board";

export default async function MarketReceiveRejectClassificationPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "DOI_TAC_VAN_HANH" && !isAdminRole(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/market-receive/reject-classification"))) redirect("/dashboard");

  return <RejectClassificationListBoard title="Phân loại hàng không đạt" />;
}
