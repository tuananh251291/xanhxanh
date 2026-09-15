import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import MotherForecastRequestsBoard from "./mother-forecast-requests-board";

export default async function MotherForecastRequestsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Khác cây ra rễ: đúng Admin kỹ thuật + Admin cấp cao duyệt được (không có Admin thường), xem comment
  // MotherForecastEditProposal (prisma/schema.prisma).
  if (role !== "ADMIN_KY_THUAT" && role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" /> Duyệt đề xuất mẫu mẹ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đề xuất chỉnh sửa &quot;Dự kiến đáp ứng mẫu mẹ&quot; do NV Kỹ thuật gửi (sau khi đã khoá nộp lần
          đầu, thường kèm giải trình khi sản lượng thực tế tụt dưới 90% kế hoạch) — duyệt thì dữ liệu mới
          thực sự cập nhật.
        </p>
      </div>
      <MotherForecastRequestsBoard />
    </div>
  );
}
