import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Users, ChevronRight } from "lucide-react";

// Hub liên kết nhẹ (KHÔNG dùng Tabs) — trước đây gộp cả "Người dùng" và "Cài đặt Sale" (2 hub tab riêng
// mỗi cái, xem lịch sử) nhưng Cài đặt Sale đã chuyển thành 1 tab trong /master-data ("Cài đặt CSDL chung
// hệ thống") nên chỉ còn đúng 1 thẻ ở đây. Vẫn giữ dạng hub link (không redirect thẳng /users) để không
// phải sửa lại ROLE_NAV.SUPER_ADMIN nếu sau này có thêm mục khác cần gộp vào đây.
export default async function UserManagementPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const cards = [
    { href: "/users", icon: Users, title: "Người dùng", description: "Quản lý tài khoản nhân viên, duyệt tài khoản mới, phân quyền theo trang." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-strong" /> Quản lý người dùng
        </h1>
        <p className="text-text-secondary text-sm mt-1">Tài khoản nhân viên.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-md">
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
