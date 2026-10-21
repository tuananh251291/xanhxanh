import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FileCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import PriceCheckBoard from "./price-check-board";

export default async function PriceCheckPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/price-check"))) redirect("/dashboard");
  if (role !== "SALE" && role !== "SUPER_ADMIN") redirect("/dashboard");
  const markets = await prisma.market.findMany({
    where: { isActive: true, priceListEnabled: true }, orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, currency: true, derivedCurrency: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-secondary-foreground" /> Kiểm tra giá file PDF
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tải phiếu báo giá PDF lên để đối chiếu với Bảng giá tháng đang áp dụng của thị trường
        </p>
      </div>

      <PriceCheckBoard markets={markets} />
    </div>
  );
}
