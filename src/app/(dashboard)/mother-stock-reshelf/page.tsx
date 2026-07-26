import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import MotherStockReshelfBoard from "./mother-stock-reshelf-board";

export default async function MotherStockReshelfPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/mother-stock-reshelf")) || role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-primary-strong" /> Sắp xếp kho mẫu mẹ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Chuyển mẫu mẹ từ giàn kệ này sang giàn kệ khác trong Phòng mẫu mẹ — hệ thống tự kiểm tra sức chứa và đúng mã cây của kệ đích.
        </p>
      </div>
      <MotherStockReshelfBoard />
    </div>
  );
}
