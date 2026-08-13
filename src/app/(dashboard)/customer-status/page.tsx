import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import CustomerStatusBoard from "./customer-status-board";

export default async function CustomerStatusPage() {
  const session = await auth();
  if (session?.user?.role !== "SALE") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-primary-strong" /> Cập nhật tình trạng khách hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Danh sách khách hàng bạn đang phụ trách — cập nhật Ngày ra đơn/Mã đơn gần nhất để giữ khách. Sau 2 tháng kể từ Ngày đầu
          tiếp cận không có đơn nào, khách sẽ tự động chuyển về &quot;Chưa phân công&quot;.
        </p>
      </div>
      <CustomerStatusBoard />
    </div>
  );
}
