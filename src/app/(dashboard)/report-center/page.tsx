import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, TrendingUp, Gauge, Images, ChevronRight, ArrowLeftRight, Sprout, BookOpen, ClipboardList, Download, Flag, DollarSign, Boxes, AlertTriangle, ClipboardCheck } from "lucide-react";
import { isAdminRole, canManagePayroll } from "@/types";

// Hub liên kết nhẹ (KHÔNG dùng Tabs) — 2/3 trang báo cáo gốc đã bị tách riêng CÓ CHỦ ĐÍCH trước đây (xem
// comment gốc ở reports/overview/page.tsx và reports/production-capacity/page.tsx, cái sau ghi rõ
// "tránh xung đột chỉnh sửa đồng thời với reports/page.tsx") nên KHÔNG gộp bằng Tabs thật — chỉ các thẻ
// dẫn sang, không đụng gì file gốc.
export default async function ReportCenterPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  const cards = [
    { href: "/reports", icon: BarChart3, title: "Báo cáo", description: "Sản lượng, tỉ lệ nhiễm, kế hoạch vs thực tế, tồn kho, checklist." },
    { href: "/reports/overview", icon: TrendingUp, title: "Thống kê trực quan", description: "Xếp hạng nhân viên, xu hướng tỉ lệ, phân tích nhiễm theo chỉ định." },
    { href: "/reports/production-capacity", icon: Gauge, title: "Năng lực sản xuất", description: "Dự báo năng lực theo nhóm tuần xoay vòng." },
    { href: "/reports/inventory-flow-summary", icon: ArrowLeftRight, title: "Tổng hợp Nhập - Xuất", description: "Tổng nhập (theo NCC) và xuất (đơn hàng, khu SX, trồng/hủy)." },
    { href: "/reports/mother-stock-growth", icon: Sprout, title: "Mẫu mẹ gia tăng", description: "Sản lượng mẫu mẹ tăng thêm, lọc theo mã cây và tuần." },
    { href: "/reports/planting-log-summary", icon: BookOpen, title: "Dữ liệu nhật ký cấy", description: "Số cây cấy, cấy ra mẫu mẹ/thành phẩm theo NV, tuần/tháng." },
    { href: "/reports/production-record", icon: Boxes, title: "Số lượng ghi nhận", description: "Sản lượng tính KPI của NV cấy mô theo tháng, chi tiết theo ngày." },
    { href: "/reports/instruction-plan-vs-actual", icon: ClipboardList, title: "Dữ liệu chỉ định cấy", description: "So sánh kỳ vọng lúc tạo chỉ định với thực tế đã cấy ra." },
    { href: "/mother-photo-update/view", icon: Images, title: "Xem dữ liệu hình ảnh", description: "Ảnh cập nhật mẫu mẹ theo giàn kệ/mã cây." },
    { href: "/reports/downloads", icon: Download, title: "Tải dữ liệu thống kê", description: "File Excel tồn kho cuối kỳ hàng tháng, theo cơ sở." },
    { href: "/reports/inspection-lane", icon: Flag, title: "Phân loại luồng kiểm tra", description: "NV cấy mô thuộc luồng Xanh/Vàng/Đỏ, theo khu sản xuất." },
    { href: "/reports/inspection-defects", icon: AlertTriangle, title: "Phiếu kiểm tra không đạt/nhiễm", description: "Phiếu ghi nhận hàng không đạt/nhiễm theo NV, tháng." },
    { href: "/reports/rooting-quality-evaluations", icon: ClipboardCheck, title: "Báo cáo đánh giá chất lượng ra rễ", description: "Tỉ lệ đạt cây ra rễ hàng tuần, NV kỹ thuật đánh giá." },
    { href: "/reports/probation-evaluations", icon: ClipboardCheck, title: "Báo cáo đánh giá thử việc", description: "Kết quả đánh giá 9 tuần thử việc của NV cấy mô." },
    { href: "/reports/output-deviation", icon: AlertTriangle, title: "Lệch chỉ định & nguyên nhân", description: "Lần cấy lệch chỉ định quá ngưỡng, kèm nguyên nhân." },
    // Dữ liệu lương nhạy cảm — chỉ hiện thẻ này nếu role hiện tại thật sự xem được (xem canManagePayroll,
    // hiện chỉ SUPER_ADMIN trong số các role admin, KHÔNG gồm ADMIN thường/ADMIN_KY_THUAT).
    ...(canManagePayroll(role) ? [{ href: "/reports/payroll", icon: DollarSign, title: "Bảng lương", description: "Lương NV cấy mô theo kỳ, xuất Excel tổng hợp." }] : []),
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
              <CardContent className="flex items-center gap-3 py-1">
                <div className="bg-primary-light p-2 rounded-lg shrink-0">
                  <c.icon className="w-5 h-5 text-primary-strong" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{c.title}</p>
                  <p className="text-sm text-text-secondary mt-0.5">{c.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
