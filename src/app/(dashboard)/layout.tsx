import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
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
    navItems = roleNavItems.filter((item) => item.href === "/dashboard" || !disabledHrefs.has(item.href));
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        user={{
          name: session.user.name ?? "",
          email: session.user.email ?? "",
          role,
        }}
        navItems={navItems}
        alertCount={alertCount}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
