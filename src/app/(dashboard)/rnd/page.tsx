import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { isAdminRole } from "@/types";
import RndBoard from "./rnd-board";

// Trang riêng của Admin kỹ thuật (mục "R&D" — chỉ role này có trong ROLE_NAV, xem UserRole.ADMIN_KY_THUAT
// ở schema.prisma). 2 mục: "Quản lý giống mới" (tạo/theo dõi giống cây thử nghiệm, tách hoàn toàn khỏi
// kho/tồn kho sản xuất thật) và "Cập nhật tiến độ sản xuất" (nhắc lịch cấy theo số tuần chờ Admin tự
// nhập, nhập số liệu mẫu mẹ/cây trả ra). Cho phép mọi role isAdminRole xem (không riêng ADMIN_KY_THUAT)
// để Admin/Admin cấp cao tiện theo dõi khi cần.
export default async function RndPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-primary-strong" /> R&D
        </h1>
        <p className="text-text-secondary text-sm mt-1">Nghiên cứu & phát triển — giống mới, tiến độ thử nghiệm.</p>
      </div>

      <RndBoard />
    </div>
  );
}
