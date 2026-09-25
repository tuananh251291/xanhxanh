import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import RejectClassificationListBoard from "../market-receive/reject-classification/reject-classification-list-board";

// isRetailManager KHÔNG nằm trong session (giống isRetailManager ở (dashboard)/layout.tsx) — tra riêng
// từ DB để biết NV bán hàng này có được gán RetailWarehouseAccess hay không trước khi cho vào trang.
export default async function RejectClassificationPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) {
    if (role !== "SALE") redirect("/dashboard");
    const user = await prisma.user.findUnique({ where: { id: session!.user!.id }, select: { isRetailManager: true } });
    if (!user?.isRetailManager) redirect("/dashboard");
  }
  if (!(await isPageAllowed(role, "/reject-classification"))) redirect("/dashboard");

  return <RejectClassificationListBoard title="Duyệt hàng không đạt" />;
}
