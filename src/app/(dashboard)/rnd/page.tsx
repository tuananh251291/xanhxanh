import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";
import { isAdminRole } from "@/types";

// Trang riêng của Admin kỹ thuật (mục "R&D" — chỉ role này có trong ROLE_NAV, xem UserRole.ADMIN_KY_THUAT
// ở schema.prisma) — hiện là trang trống chờ mô tả nghiệp vụ cụ thể. Cho phép mọi role isAdminRole xem
// (không riêng ADMIN_KY_THUAT) để Admin/Admin cấp cao tiện theo dõi khi cần.
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
        <p className="text-text-secondary text-sm mt-1">Nghiên cứu & phát triển.</p>
      </div>

      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Trang đang được xây dựng — nội dung cụ thể sẽ bổ sung sau.</p>
        </CardContent>
      </Card>
    </div>
  );
}
