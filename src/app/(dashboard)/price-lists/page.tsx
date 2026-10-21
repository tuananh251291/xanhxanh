import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DollarSign, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canApprovePriceList, canUploadPriceList, canViewPriceList } from "@/lib/price-list";
import PriceListBoard from "./price-list-board";

export default async function PriceListsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewPriceList(role)) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary-strong" /> Bảng giá tháng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Bảng giá theo bậc số lượng của từng thị trường. NV Trợ lý tải bảng giá tháng sau (mỗi thị trường 1 file Excel) trước ngày cuối tháng,
          Admin cấp cao duyệt mới có hiệu lực.
        </p>
        </div>
        {(role === "SALE" || role === "SUPER_ADMIN") && (
          <Link href="/price-check"><Button variant="outline"><FileCheck className="w-4 h-4 mr-1.5" /> Kiểm tra giá file PDF</Button></Link>
        )}
      </div>
      <PriceListBoard canUpload={canUploadPriceList(role)} canApprove={canApprovePriceList(role)} />
    </div>
  );
}
