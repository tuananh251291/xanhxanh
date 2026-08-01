import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FileCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import PriceCheckBoard from "./price-check-board";

export default async function PriceCheckPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/price-check"))) redirect("/dashboard");
  if (role !== "SALE") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-secondary-foreground" /> Kiểm tra giá invoice
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tải invoice PDF lên để đối chiếu với bảng giá sản phẩm đang áp dụng
        </p>
      </div>

      <PriceCheckBoard />
    </div>
  );
}
