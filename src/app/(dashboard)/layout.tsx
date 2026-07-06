import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import AuthSessionProvider from "@/components/providers/session-provider";
import { ROLE_NAV, isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import PendingStatusScreen from "./pending-status-screen";
import { ensureMotherReadyAlerts } from "@/lib/mother-ready";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.status !== "APPROVED") {
    return <PendingStatusScreen status={session.user.status} />;
  }

  const role = session.user.role as UserRole;

  if (role === "KY_THUAT") await ensureMotherReadyAlerts();

  const alertCount = await prisma.alert.count({
    where: {
      status: "UNREAD",
      OR: [{ userId: session.user.id }, { targetRole: role }],
    },
  });

  // Fail-open giống isPageAllowed() (src/lib/permissions.ts) — trang mới thêm vào ROLE_NAV hiện ngay trong
  // menu cho tới khi Admin chủ động tắt qua ma trận phân quyền, thay vì phải bật thủ công mới hiện.
  const roleNavItems = ROLE_NAV[role] ?? [];
  let navItems = roleNavItems;
  if (!isAdminRole(role)) {
    const disabled = await prisma.rolePermission.findMany({
      where: { role, enabled: false },
      select: { href: true },
    });
    const disabledHrefs = new Set(disabled.map((p) => p.href));
    navItems = roleNavItems.filter((item) => item.href === "/dashboard" || item.href === "/account" || !disabledHrefs.has(item.href));
  }

  return (
    <AuthSessionProvider session={session}>
      <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
        <Sidebar
          user={{
            name: session.user.name ?? "",
            email: session.user.email ?? "",
            role,
            avatar: session.user.avatar,
          }}
          navItems={navItems}
          alertCount={alertCount}
        />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="p-3 sm:p-4 md:p-6">
            {children}
          </div>
        </main>
        <Toaster richColors position="top-right" />
      </div>
    </AuthSessionProvider>
  );
}
