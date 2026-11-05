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
import { ensureWeeklyDeXuatTask, ensureDeXuatTaskCompletion, ensureWeeklyManagerTask } from "@/lib/daily-task-weekly";
import { ensureWeeklyMarketInspectionTask } from "@/lib/market-inspection";
import { ensureRootingForecastReminder } from "@/lib/rooting-forecast";
import { ensureMotherForecastReminder, ensureMotherOutputShortfallAlerts } from "@/lib/mother-forecast";
import { ensureWeeklyRootingQualityEvaluation, ensureRootingQualityEvaluationReminder } from "@/lib/rooting-quality-evaluation";
import { ensureWeeklyProbationEvaluations } from "@/lib/probation-evaluation";
import { ensureMonthlyInspectionLaneUpdate, ensureInspectionLaneOverridesApplied } from "@/lib/inspection-lane";
import { ensureExpiredExtraWorkReadinessAlertsRead, ensureExpiredExtraWorkRequestsCleaned } from "@/lib/extra-work-lifecycle";
import { ensureMissedDailyRecordViolations } from "@/lib/missed-daily-record";
import AiAssistantWidget from "@/components/shared/ai-assistant-widget";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { vnDateKey } from "@/lib/attendance";
import { ensureSupplierCheckDeadlines } from "@/lib/supplier-check";
import { getAnnualLeaveUsage } from "@/lib/attendance-server";

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
  // Sau ensureInstructionsEnded (cần trạng thái chỉ định mới nhất). Lỗi ở đây không được chặn render trang.
  try {
    await ensureMissedDailyRecordViolations();
  } catch (err) {
    console.error("[layout] ensureMissedDailyRecordViolations lỗi:", err);
  }
  if (role === "KY_THUAT") {
    await ensureMotherReadyAlerts();
    await ensureRootingForecastReminder(session.user.workplaceWarehouseId);
    await ensureMotherForecastReminder(session.user.workplaceWarehouseId);
    await ensureMotherOutputShortfallAlerts(session.user.workplaceWarehouseId);
    await ensureWeeklyRootingQualityEvaluation(session.user.workplaceWarehouseId);
    await ensureRootingQualityEvaluationReminder(session.user.workplaceWarehouseId);
  }
  if (role === "QUAN_LY_KHO_THANH_PHAM") await ensureSupplierCheckDeadlines();
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
    await ensureWeeklyManagerTask(session.user.workplaceWarehouseId);
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
  let disabledHrefs = new Set<string>();
  if (!isAdminRole(role)) {
    const disabled = await prisma.rolePermission.findMany({
      where: { role, enabled: false },
      select: { href: true },
    });
    disabledHrefs = new Set(disabled.map((p) => p.href));
    navItems = roleNavItems.filter((item) => item.href === "/dashboard" || item.href === "/account" || !disabledHrefs.has(item.href));
  }
  // "Lộ trình đào tạo"/"Đánh giá thử việc" chỉ hiện cho NV cấy mô ĐANG thử việc (employmentType =
  // THU_VIEC) — NV chính thức không còn cần xem lại 2 mục này nữa dù trang vẫn được phép qua ma trận
  // phân quyền.
  if (role === "CAY_MO" && currentUser?.employmentType !== "THU_VIEC") {
    navItems = navItems.filter((item) => item.href !== "/training-roadmap" && item.href !== "/probation-evaluations");
  }
  // Các mục "Quản lý bán lẻ" chỉ hiện cho NV bán hàng có bật User.isRetailManager — không nằm sẵn trong
  // ROLE_NAV.SALE (khác đa số role khác, các trang này vốn dành cho Đối tác vận hành) nên chèn động vào
  // đây thay vì lọc bớt. "Tồn kho Kho thị trường" KHÔNG có mục riêng nữa — đã gộp hiển thị (số liệu vẫn
  // tách riêng) vào section cuối trang "/inventory/dat-tieu-chuan" (mục "Xem tồn đạt tiêu chuẩn" có sẵn
  // trong ROLE_NAV.SALE), trang /inventory/thi-truong vẫn còn hoạt động nếu có ai truy cập thẳng URL.
  // Vẫn lọc theo ma trận phân quyền như các mục khác (Admin tắt được cả 3 mục này cho NV bán hàng).
  if (role === "SALE" && currentUser?.isRetailManager) {
    navItems = [
      ...navItems,
      ...[
        { href: "/reject-classification", label: "Duyệt hàng không đạt", icon: "ClipboardCheck" },
        { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
        { href: "/reports/partner", label: "Báo cáo Kho thị trường", icon: "BarChart3" },
      ].filter((item) => !disabledHrefs.has(item.href)),
    ];
  }

  // NV cấy mô: số phép năm còn lại (tổng − đã duyệt − đang chờ duyệt, năm hiện tại giờ VN) ở góc dưới phải mọi
  // trang. Lỗi tính phép không được chặn render trang.
  let leaveRemaining: { remaining: number; total: number; pending: number } | null = null;
  if (role === "CAY_MO") {
    try {
      leaveRemaining = await getAnnualLeaveUsage(session.user.id, Number(vnDateKey(new Date()).slice(0, 4)));
    } catch (err) {
      console.error("[layout] getAnnualLeaveUsage lỗi:", err);
    }
  }

  // Người duyệt đơn chấm công cấp 1 ("quản lý khu", HCNS chọn ở Bảng chấm công → Cài đặt khu) không cố
  // định theo vai trò — chèn động mục duyệt cho đúng người đang được gán ở ít nhất 1 khu.
  if (!navItems.some((item) => item.href === "/attendance/approvals")) {
    const approvingSite = await prisma.attendanceSite.findFirst({ where: { approverId: session.user.id }, select: { id: true } });
    if (approvingSite) {
      const accountIdx = navItems.findIndex((item) => item.href === "/account");
      const item = { href: "/attendance/approvals", label: "Duyệt đơn chấm công", icon: "ClipboardCheck" };
      navItems = accountIdx === -1 ? [...navItems, item] : [...navItems.slice(0, accountIdx), item, ...navItems.slice(accountIdx)];
    }
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
        {leaveRemaining && (
          <Link
            href="/attendance"
            className="fixed bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm shadow-md hover:bg-primary-light transition-colors"
            title="Phép năm còn lại (đã trừ đơn đã duyệt và đang chờ duyệt) — bấm để xem Chấm công"
          >
            <CalendarDays className="w-4 h-4 text-primary-strong" />
            <span className="text-text-secondary">Phép năm còn</span>
            <span className={`font-bold tabular-nums ${leaveRemaining.remaining > 0 ? "text-primary-strong" : "text-destructive"}`}>
              {leaveRemaining.remaining.toLocaleString("vi-VN")}/{leaveRemaining.total.toLocaleString("vi-VN")}
            </span>
            <span className="text-text-secondary">ngày</span>
            {leaveRemaining.pending > 0 && <span className="text-xs text-warning-foreground">(chờ duyệt {leaveRemaining.pending.toLocaleString("vi-VN")})</span>}
          </Link>
        )}
        {/* Giai đoạn 1 — chỉ SUPER_ADMIN/ADMIN_KY_THUAT, cố tình hẹp hơn isAdminRole (không có ADMIN
            thường). Server (/api/ai-assistant) cũng tự chặn lại, đây chỉ là ẩn UI. */}
        {(role === "SUPER_ADMIN" || role === "ADMIN_KY_THUAT") && <AiAssistantWidget />}
      </div>
    </AuthSessionProvider>
  );
}
