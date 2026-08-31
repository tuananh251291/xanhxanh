import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/types";
import { PackageCheck } from "lucide-react";
import RootingForecastRequestsBoard from "./rooting-forecast-requests-board";

export default async function RootingForecastRequestsPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" /> Duyệt đề xuất cây ra rễ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đề xuất chỉnh sửa &quot;Dự kiến đáp ứng cây ra rễ&quot; do NV Kỹ thuật gửi sau khi đã khoá nộp lần
          đầu — duyệt thì dữ liệu mới thực sự cập nhật.
        </p>
      </div>
      <RootingForecastRequestsBoard />
    </div>
  );
}
