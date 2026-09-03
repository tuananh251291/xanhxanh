import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Sprout, Flower2 } from "lucide-react";
import { isAdminRole } from "@/types";

// Hub "Tải dữ liệu thống kê" — các file Excel Admin tải trực tiếp (không xem trên web), khác
// /reports/overview (biểu đồ xem trực tiếp). Mỗi mục chỉ là 1 link GET tới route xuất Excel tương ứng
// (xem src/lib/monthly-stock-export.ts) — trình duyệt tự tải nhờ Content-Disposition, không cần dialog.
export default async function ReportsDownloadsPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) redirect("/dashboard");

  const files = [
    {
      href: "/api/reports/monthly-mother-stock-export",
      icon: Sprout,
      title: "Số tồn kho mẫu mẹ cuối kỳ hàng tháng",
      description: "Phân loại theo cơ sở (kho sản xuất), từ tháng 7/2026 đến tháng hiện tại.",
    },
    {
      href: "/api/reports/monthly-finished-stock-export",
      icon: Flower2,
      title: "Số tồn kho cây thành phẩm cuối kỳ hàng tháng",
      description: "Phân loại theo cơ sở (kho sản xuất), từ tháng 7/2026 đến tháng hiện tại.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-primary-strong" /> Tải dữ liệu thống kê
        </h1>
        <p className="text-text-secondary text-sm mt-1">Các file Excel tổng hợp số liệu theo tháng, tải trực tiếp về máy.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {files.map((f) => (
          <Card key={f.href}>
            <CardContent className="flex items-start gap-4 py-6">
              <div className="bg-primary-light p-2.5 rounded-lg shrink-0">
                <f.icon className="w-6 h-6 text-primary-strong" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground">{f.title}</p>
                <p className="text-sm text-text-secondary mt-1">{f.description}</p>
                <a href={f.href} className="inline-block mt-3">
                  <Button size="sm" className="bg-primary hover:bg-primary-hover">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Tải Excel
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
