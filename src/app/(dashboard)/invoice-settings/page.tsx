import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canEditInvoiceSettings, canEditUsShipments } from "@/lib/invoice";
import InvoiceSettingsBoard from "./invoice-settings-board";

export default async function InvoiceSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canEdit = canEditInvoiceSettings(session.user.role);
  const canShip = await canEditUsShipments(session.user);
  if (!canEdit && !canShip) redirect("/dashboard");
  const markets = await prisma.market.findMany({
    where: { isActive: true }, orderBy: { code: "asc" },
    select: { code: true, name: true, currency: true, derivedCurrency: true, invoiceCalcKind: true },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Settings className="w-6 h-6 text-primary-strong" /> {canEdit ? "Cài đặt invoice" : "Lịch chuyến Mỹ"}</h1>
        <p className="text-text-secondary text-sm mt-1">
          {canEdit ? "Phí ship, thuế, phụ thu theo từng thị trường — tick để bật/tắt từng khoản. Áp dụng cho invoice lập/sửa từ lúc lưu; invoice đã lưu giữ nguyên số." : "Lịch chuyến hàng Mỹ và mức cân (kg) dùng tính cước — NV bán hàng chọn chuyến khi lập invoice."}
        </p>
      </div>
      <InvoiceSettingsBoard markets={markets} canEdit={canEdit} />
    </div>
  );
}
