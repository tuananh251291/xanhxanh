import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import AuthSessionProvider from "@/components/providers/session-provider";
import { ROLE_NAV, isAdminRole, isKhoThanhPhamRole, alertTargetRolesFor } from "@/types";
import type { UserRole } from "@prisma/client";
import PendingStatusScreen from "./pending-status-screen";
import { ensureMotherReadyAlerts } from "@/lib/mother-ready";
import { ensureRootingReadyAlerts } from "@/lib/rooting-ready";
import { ensureInstructionsEnded, ensureBackupInstructionsCleaned } from "@/lib/instruction-lifecycle";
import { ensureExpiredOrdersCancelled } from "@/lib/order-lifecycle";
import { ensureMediumOrdersSent } from "@/lib/medium-order-lifecycle";
import { ensureCustomerAutoExpire, ensureCustomerStatusReminders } from "@/lib/customer-lifecycle";
import { ensureWeeklyDeXuatTask, ensureDeXuatTaskCompletion } from "@/lib/daily-task-weekly";
import { ensureWeeklyMarketInspectionTask } from "@/lib/market-inspection";
import { ensureRootingForecastReminder } from "@/lib/rooting-forecast";
import { ensureMotherForecastReminder, ensureMotherOutputShortfallAlerts } from "@/lib/mother-forecast";
import { ensureWeeklyRootingQualityEvaluation, ensureRootingQualityEvaluationReminder } from "@/lib/rooting-quality-evaluation";
import { ensureWeeklyProbationEvaluations } from "@/lib/probation-evaluation";
import { ensureMonthlyInspectionLaneUpdate, ensureInspectionLaneOverridesApplied } from "@/lib/inspection-lane";
import { ensureExpiredExtraWorkReadinessAlertsRead, ensureExpiredExtraWorkRequestsCleaned } from "@/lib/extra-work-lifecycle";
import AiAssistantWidget from "@/components/shared/ai-assistant-widget";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.status !== "APPROVED" || session.user.sessionRevoked) {
    return <PendingStatusScreen status={session.user.status} sessionRevoked={session.user.sessionRevoked} />;
  }

  const role = session.user.role as UserRole;

  await ensureInstructionsEnded();
  await ensureBackupInstructionsCleaned();
  await ensureExpiredExtraWorkRequestsCleaned();
  await ensureExpiredOrdersCancelled();
  await ensureMediumOrdersSent();
  await ensureCustomerAutoExpire();
  await ensureMonthlyInspectionLaneUpdate();
  await ensureInspectionLaneOverridesApplied();
  if (role === "KY_THUAT") {
    await ensureMotherReadyAlerts();
    await ensureRootingForecastReminder(session.user.workplaceWarehouseId);
    await ensureMotherForecastReminder(session.user.workplaceWarehouseId);
    await ensureMotherOutputShortfallAlerts(session.user.workplaceWarehouseId);
    await ensureWeeklyRootingQualityEvaluation(session.user.workplaceWarehouseId);
    await ensureRootingQualityEvaluationReminder(session.user.workplaceWarehouseId);
  }
  if (role === "KHO_MO") {
    await ensureRootingReadyAlerts();
    await ensureExpiredExtraWorkReadinessAlertsRead();
  }
  if (role === "CAY_MO") {
    await ensureWeeklyProbationEvaluations(session.user.id);
  }
  if (role === "SALE") await ensureCustomerStatusReminders(session.user.id);
  if (isKhoThanhPhamRole(role)) {
    await ensureWeeklyDeXuatTask(session.user.workplaceWarehouseId);
    await ensureDeXuatTaskCompletion(session.user.workplaceWarehouseId);
  }
  if (role === "DOI_TAC_VAN_HANH") {
    await ensureWeeklyMarketInspectionTask(session.user.workplaceWarehouseId);
    await ensureDeXuatTaskCompletion(session.user.workplaceWarehouseId);
  }

  // Avatar KHÔNG nằm trong session (xem comment ở src/lib/auth.config.ts) — query DB riêng ở đây.
  // employmentType cũng lấy kèm ở đây để quyết định có hiện mục "Lộ trình đào tạo" cho NV cấy mô thử
  // việc hay không (xem lọc navItems bên dưới) — không áp dụng vai trò khác nên luôn null với các role đó.
  // isRetailManager tương tự — quyết định có hiện mục "Tồn kho Kho thị trường" cho NV bán hàng hay không.
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatar: true, employmentType: true, isRetailManager: true },
  });

  const alertCount = await prisma.alert.count({
    where: {
      status: "UNREAD",
      OR: [{ userId: session.user.id }, { targetRole: { in: alertTargetRolesFor(role) } }],
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
  // "Lộ trình đào tạo"/"Đánh giá thử việc" chỉ hiện cho NV cấy mô ĐANG thử việc (employmentType =
  // THU_VIEC) — NV chính thức không còn cần xem lại 2 mục này nữa dù trang vẫn được phép qua ma trận
  // phân quyền.
  if (role === "CAY_MO" && currentUser?.employmentType !== "THU_VIEC") {
    navItems = navItems.filter((item) => item.href !== "/training-roadmap" && item.href !== "/probation-evaluations");
  }
  // "Tồn kho Kho thị trường" chỉ hiện cho NV bán hàng có bật "Quản lý bán lẻ" — không nằm sẵn trong
  // ROLE_NAV.SALE (khác đa số role khác, trang này vốn dành cho Đối tác vận hành) nên chèn động vào đây
  // thay vì lọc bớt.
  if (role === "SALE" && currentUser?.isRetailManager) {
    navItems = [...navItems, { href: "/inventory/thi-truong", label: "Tồn kho Kho thị trường", icon: "Boxes" }];
  }

  return (
    <AuthSessionProvider session={session}>
      <div className="flex min-h-screen flex-col bg-background md:flex-row">
        <Sidebar
          user={{
            name: session.user.name ?? "",
            email: session.user.email ?? "",
            role,
            avatar: currentUser?.avatar ?? null,
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
        {/* Giai đoạn 1 — chỉ SUPER_ADMIN/ADMIN_KY_THUAT, cố tình hẹp hơn isAdminRole (không có ADMIN
            thường). Server (/api/ai-assistant) cũng tự chặn lại, đây chỉ là ẩn UI. */}
        {(role === "SUPER_ADMIN" || role === "ADMIN_KY_THUAT") && <AiAssistantWidget />}
      </div>
    </AuthSessionProvider>
  );
}
