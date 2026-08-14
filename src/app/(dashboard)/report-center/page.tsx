import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, TrendingUp, Gauge, Images, ChevronRight } from "lucide-react";
import { isAdminRole } from "@/types";

// Hub liên kết nhẹ (KHÔNG dùng Tabs) — 2/3 trang báo cáo gốc đã bị tách riêng CÓ CHỦ ĐÍCH trước đây (xem
// comment gốc ở reports/overview/page.tsx và reports/production-capacity/page.tsx, cái sau ghi rõ
// "tránh xung đột chỉnh sửa đồng thời với reports/page.tsx") nên KHÔNG gộp bằng Tabs thật — chỉ các thẻ
// dẫn sang, không đụng gì file gốc. "Xem dữ liệu hình ảnh" chỉ hiện cho SUPER_ADMIN — giữ đúng phạm vi
// ROLE_NAV hiện có (ADMIN chưa được cấp trong menu dù trang gốc kỹ thuật cho phép cả 2 role).
export default async function ReportCenterPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  const cards = [
    { href: "/reports", icon: BarChart3, title: "Báo cáo", description: "Sản lượng, tỉ lệ nhiễm, kế hoạch vs thực tế, tồn kho & vòng đời, checklist." },
    { href: "/reports/overview", icon: TrendingUp, title: "Thống kê trực quan", description: "Bảng xếp hạng nhân viên, xu hướng tỉ lệ, phân tích nhiễm theo chỉ định." },
    { href: "/reports/production-capacity", icon: Gauge, title: "Năng lực sản xuất", description: "Dự báo năng lực sản xuất theo nhóm tuần xoay vòng." },
    ...(role === "SUPER_ADMIN"
      ? [{ href: "/mother-photo-update/view", icon: Images, title: "Xem dữ liệu hình ảnh", description: "Ảnh cập nhật tình trạng mẫu mẹ theo giàn kệ/mã cây." }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-strong" /> Báo cáo
        </h1>
        <p className="text-text-secondary text-sm mt-1">Báo cáo tổng hợp, thống kê trực quan và năng lực sản xuất.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="h-full hover:border-primary transition-colors">
              <CardContent className="flex items-start gap-4 py-6">
                <div className="bg-primary-light p-2.5 rounded-lg shrink-0">
                  <c.icon className="w-6 h-6 text-primary-strong" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{c.title}</p>
                  <p className="text-sm text-text-secondary mt-1">{c.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-text-muted shrink-0 mt-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
