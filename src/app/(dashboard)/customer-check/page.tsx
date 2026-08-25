import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import CustomerCheckForm from "./customer-check-form";

export default async function CustomerCheckPage() {
  const session = await auth();
  if (session?.user?.role !== "SALE") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Search className="w-6 h-6 text-primary-strong" /> Kiểm tra trùng khách
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhập Tên khách hàng - công ty và Website, Số điện thoại, Email trước khi tiếp cận khách hàng mới, để tránh trùng với khách đã có người phụ trách.
        </p>
      </div>
      <CustomerCheckForm />
    </div>
  );
}
