import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Handshake, ChevronRight } from "lucide-react";

// Hub liên kết nhẹ (KHÔNG dùng Tabs) — Người dùng và Cài đặt Sale đều đã tự là hub nhiều tab/phân trang
// riêng (Người dùng có tab Tài khoản/Phân quyền + phân trang theo URL riêng, Cài đặt Sale có 3 tab con)
// nên gộp thêm 1 lớp Tabs ngoài sẽ thành tab-trong-tab, không đáng — chỉ cần 2 thẻ dẫn sang, không đụng
// gì file 2 trang gốc. ADMIN không có Cài đặt Sale nên không cần trang hub này (ROLE_NAV.ADMIN trỏ thẳng
// /users).
export default async function UserManagementPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "SUPER_ADMIN") redirect("/dashboard");

  const cards = [
    { href: "/users", icon: Users, title: "Người dùng", description: "Quản lý tài khoản nhân viên, duyệt tài khoản mới, phân quyền theo trang." },
    { href: "/settings/sale", icon: Handshake, title: "Cài đặt Sale", description: "Danh sách khách hàng, thị trường, phân công nhân viên quản lý cho đội bán hàng." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-strong" /> Quản lý người dùng
        </h1>
        <p className="text-text-secondary text-sm mt-1">Tài khoản nhân viên và cài đặt riêng cho đội bán hàng.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
