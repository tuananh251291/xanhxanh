import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import CompanyProfileBoard from "./company-profile-board";

export default async function CompanyProfilesPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/dashboard");
  // Đã chuyển vào Cài đặt CSDL chung hệ thống.
  redirect("/master-data?tab=company-profiles");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary-strong" /> Thông tin công ty
        </h1>
        <p className="text-text-secondary text-sm mt-1">Các mẫu thông tin công ty in trên phiếu báo giá — NV bán hàng chọn 1 mẫu khi lập phiếu báo giá.</p>
      </div>
      <CompanyProfileBoard />
    </div>
  );
}
