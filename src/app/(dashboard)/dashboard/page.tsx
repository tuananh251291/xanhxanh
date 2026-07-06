import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package, Leaf, AlertTriangle, ShoppingCart, Users, Sun, Moon, TrendingUp,
  PackageCheck, PenLine, Send, CheckCircle2, XCircle, ClipboardList, ClipboardCheck, type LucideIcon,
} from "lucide-react";
import { ROLE_LABELS, LOT_STATUS_LABELS, ORDER_STATUS_LABELS, isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import { formatDistanceToNow, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays, addWeeks, format } from "date-fns";
import { vi } from "date-fns/locale";
import TodayChecklist from "@/components/shared/today-checklist";
import ProductivityLeaderboard from "@/components/shared/productivity-leaderboard";

async function getAdminStats() {
  const [totalLots, activeLots, pendingOrders, totalUsers, recentAlerts] = await Promise.all([
    prisma.lot.count(),
    prisma.lot.count({ where: { status: "ACTIVE" } }),
    prisma.order.count({ where: { status: { in: ["HELD", "CONFIRMED"] } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.alert.findMany({
      where: { status: "UNREAD" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return { totalLots, activeLots, pendingOrders, totalUsers, recentAlerts };
}

async function getSaleStats(userId: string) {
  const [myOrders, availableLots] = await Promise.all([
    prisma.order.findMany({
      where: { saleId: userId, status: { in: ["HELD", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.lot.count({
      where: { status: "ACTIVE", stage: "THANH_PHAM" },
    }),
  ]);
  return { myOrders, availableLots };
}

// Logic xác định "hoàn thành" tạm thời dựa trên dữ liệu đã có sẵn — sẽ tinh chỉnh lại khi
// làm chi tiết từng công việc (đặc biệt việc 4, hiện chưa có bảng lưu "đã kiểm tra nhiễm hôm nay").
async function getCayMoStats(userId: string) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [pendingMotherReceipt, dailyRecordToday, handoverToday] = await Promise.all([
    // Chỉ tính trên các chỉ định Kho mô đã bàn giao (handedOverAt) — chỉ định "Chưa bàn giao" không
    // tính vào đánh giá vì NV cấy mô chưa có gì để xác nhận.
    prisma.plantingInstruction.findFirst({
      where: { assignedToId: userId, handedOverAt: { not: null }, motherReceivedAt: null },
    }),
    prisma.dailyRecord.findFirst({
      where: { staffId: userId, recordDate: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.transfer.findFirst({
      where: {
        fromUserId: userId,
        fromRoom: { type: "PHONG_TOI" },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    }),
  ]);

  return {
    motherReceived: !pendingMotherReceipt,
    dailyRecordDone: !!dailyRecordToday,
    handoverDone: !!handoverToday,
    contaminationChecked: false, // chưa có cách xác định — sẽ bổ sung khi làm chi tiết việc này
  };
}

// Việc 1: tính theo số lô — mẫu mẹ do chính KY_THUAT này phụ trách (qua chỉ định gốc tạo ra lô) đã
// "đủ thời gian đợi cấy chuyển" (expectedMoveAt <= hôm nay), kể cả lô quá hạn từ tuần trước chưa xử lý
// (không giới hạn theo tuần hiện tại) — bấy nhiêu lô phải có mặt trong 1 chỉ định (bất kỳ ai tạo) thì
// mới tính là xong; hạn chót là thứ 5 tuần này.
// Việc 2: khi CAY_MO nhập số liệu lệch quá ngưỡng so với chỉ định, hệ thống đã tự tạo alert
// OUTPUT_DEVIATION cho KY_THUAT (xem /api/daily-records) — KY_THUAT phải vào trang Thông báo chọn
// nguyên nhân (KY_THUAT_SAI/CAY_MO_SAI) để xử lý. % = số alert lệch trong tuần đã chọn nguyên nhân /
// tổng số alert lệch phát sinh trong tuần, tính trên các chỉ định do chính người này tạo.
async function getKyThuatStats(userId: string) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thursdayDeadline = addDays(weekStart, 3);

  const myInstructions = await prisma.plantingInstruction.findMany({
    where: { createdById: userId },
    select: { id: true },
  });
  const myInstructionIds = myInstructions.map((i) => i.id);

  const [dueMotherLots, deviationAlerts] = await Promise.all([
    prisma.lot.findMany({
      where: {
        stage: "MAU_ME",
        status: "ACTIVE",
        expectedMoveAt: { lte: now },
        instruction: { createdById: userId },
      },
      select: { id: true },
    }),
    myInstructionIds.length === 0
      ? Promise.resolve([])
      : prisma.alert.findMany({
          where: {
            type: "OUTPUT_DEVIATION",
            relatedType: "PlantingInstruction",
            relatedId: { in: myInstructionIds },
            createdAt: { gte: weekStart, lte: weekEnd },
          },
          select: { cause: true },
        }),
  ]);
  const dueLotIds = dueMotherLots.map((l) => l.id);

  const handledItems = dueLotIds.length === 0
    ? []
    : await prisma.plantingInstructionItem.findMany({
        where: { lotId: { in: dueLotIds } },
        distinct: ["lotId"],
        select: { lotId: true },
      });

  const instructionPercent = dueLotIds.length === 0 ? 100 : Math.round((handledItems.length / dueLotIds.length) * 100);
  const resolvedDeviations = deviationAlerts.filter((a) => a.cause !== null).length;
  const checkPercent = deviationAlerts.length === 0 ? 100 : Math.round((resolvedDeviations / deviationAlerts.length) * 100);

  return {
    weekStart, weekEnd, thursdayDeadline, instructionPercent, checkPercent,
    instructionDone: handledItems.length,
    instructionTotal: dueLotIds.length,
  };
}

// Việc "Giao mẫu mẹ theo chỉ định cấy": chỉ định cấy do KY_THUAT tạo trước Thứ 5 tuần này phải được
// Kho mô bàn giao (handedOverAt) cho NV cấy mô trước Thứ 2 tuần sau. Việc chung của cả phòng kho mô
// (không phân theo người tạo/người bàn giao) — tính cộng dồn, kể cả chỉ định quá hạn từ tuần trước
// chưa xử lý (không giới hạn theo tuần hiện tại), giống cách tính việc "Tạo chỉ định cấy" của Kỹ thuật.
// NV kho mô chỉ làm việc 1 kho sản xuất (nếu đã được gán địa điểm làm việc) — công việc chỉ tính trên
// chỉ định thuộc đúng kho đó.
async function getKhoMoWeeklyStats(workplaceWarehouseId: string | null) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thursdayDeadline = addDays(weekStart, 3);
  const nextMondayDeadline = addWeeks(weekStart, 1);

  const dueInstructions = await prisma.plantingInstruction.findMany({
    where: {
      createdAt: { lte: thursdayDeadline },
      ...(workplaceWarehouseId ? { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } : {}),
    },
    select: { handedOverAt: true },
  });
  const handoverTotal = dueInstructions.length;
  const handoverDone = dueInstructions.filter((i) => i.handedOverAt !== null).length;
  const handoverPercent = handoverTotal === 0 ? 100 : Math.round((handoverDone / handoverTotal) * 100);

  return { weekStart, weekEnd, nextMondayDeadline, handoverDone, handoverTotal, handoverPercent };
}

async function getKhoMoStats() {
  const [pendingTransfers, activeLots] = await Promise.all([
    prisma.transfer.count({ where: { status: "PENDING" } }),
    prisma.lot.groupBy({
      by: ["stage"],
      where: { status: "ACTIVE" },
      _count: true,
      _sum: { quantity: true },
    }),
  ]);
  return { pendingTransfers, activeLots };
}

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role as UserRole;
  const userId = session?.user?.id ?? "";

  if (isAdminRole(role)) {
    const stats = await getAdminStats();
    return <AdminDashboard stats={stats} />;
  }

  if (role === "SALE") {
    const stats = await getSaleStats(userId);
    return <SaleDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  if (role === "KHO_MO") {
    const stats = await getKhoMoWeeklyStats(session?.user?.workplaceWarehouseId ?? null);
    return <KhoMoTaskDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  if (role === "KHO_THANH_PHAM") {
    const stats = await getKhoMoStats();
    return <KhoDashboard stats={stats} role={role} />;
  }

  if (role === "CAY_MO") {
    const stats = await getCayMoStats(userId);
    return <CayMoDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  if (role === "KY_THUAT") {
    const stats = await getKyThuatStats(userId);
    return <KyThuatDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  return <DefaultDashboard role={role} userName={session?.user?.name ?? ""} />;
}

function GreetingBanner() {
  return (
    <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
      Ngày mới bùng nổ năng lượng và hoàn thành xuất sắc mọi mục tiêu hôm nay nhé mọi người!
    </p>
  );
}

function AdminDashboard({ stats }: { stats: Awaited<ReturnType<typeof getAdminStats>> }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard tổng quan</h1>
        <p className="text-gray-500 text-sm mt-1">Quản trị hệ thống</p>
      </div>
      <GreetingBanner />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Lô cây đang lưu" value={stats.activeLots} icon={Leaf} color="green" />
        <StatCard title="Tổng lô cây" value={stats.totalLots} icon={Package} color="blue" />
        <StatCard title="Đơn đang xử lý" value={stats.pendingOrders} icon={ShoppingCart} color="yellow" />
        <StatCard title="Nhân viên" value={stats.totalUsers} icon={Users} color="purple" />
      </div>
      <TodayChecklist />
      {stats.recentAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Cảnh báo chưa đọc ({stats.recentAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{alert.title}</p>
                    <p className="text-xs text-gray-500">{alert.message}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {formatDistanceToNow(alert.createdAt, { addSuffix: true, locale: vi })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SaleDashboard({ stats, userName }: { stats: Awaited<ReturnType<typeof getSaleStats>>; userName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Xin chào, {userName}!</h1>
        <p className="text-gray-500 text-sm mt-1">Nhân viên sale</p>
      </div>
      <GreetingBanner />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title="Tồn khả dụng (TP)" value={stats.availableLots} icon={Package} color="green" subtitle="lô thành phẩm" />
        <StatCard title="Đơn đang hoạt động" value={stats.myOrders.length} icon={ShoppingCart} color="blue" />
      </div>
      <TodayChecklist />
      {stats.myOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Đơn hàng gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.myOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{order.code}</p>
                    <p className="text-xs text-gray-500">{order.customerName}</p>
                  </div>
                  <Badge variant={order.status === "HELD" ? "secondary" : "default"}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CayMoDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getCayMoStats>>;
  userName: string;
}) {
  const today = format(new Date(), "EEEE, dd/MM/yyyy", { locale: vi });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Xin chào, {userName}!</h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">Nhân viên nuôi cấy mô · {today}</p>
      </div>
      <GreetingBanner />

      <ProductivityLeaderboard />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hôm nay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <TaskRow
            href="/my-instructions"
            icon={PackageCheck}
            title="1. Nhận bàn giao mẫu mẹ"
            description="Xác nhận đã nhận mẫu mẹ từ Kho mô"
            done={stats.motherReceived}
          />
          <TaskRow
            href="/daily-record"
            icon={PenLine}
            title="2. Cập nhật số liệu cấy"
            description="Nhập nhật ký cấy mô trong ngày"
            done={stats.dailyRecordDone}
          />
          <TaskRow
            href="/my-dark-room"
            icon={Send}
            title="3. Bàn giao sản phẩm"
            description="Bàn giao lô từ phòng tối cho Kho mô"
            done={stats.handoverDone}
          />
          <TaskRow
            href="/my-dark-room"
            icon={Moon}
            title="4. Kiểm tra nhiễm phòng tối"
            description="Kiểm tra và báo cáo nhiễm các lô trong phòng tối"
            done={stats.contaminationChecked}
          />
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

function TaskRow({
  href, icon: Icon, title, description, done,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl shrink-0 ${done ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-500 truncate">{description}</p>
        </div>
      </div>
      <Badge
        className={`shrink-0 gap-1 ${done ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}`}
      >
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {done ? "Đã hoàn thành" : "Chưa hoàn thành"}
      </Badge>
    </Link>
  );
}

function KyThuatDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getKyThuatStats>>;
  userName: string;
}) {
  const weekLabel = `${format(stats.weekStart, "dd/MM", { locale: vi })} — ${format(stats.weekEnd, "dd/MM/yyyy", { locale: vi })}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Xin chào, {userName}!</h1>
        <p className="text-gray-500 text-sm mt-1">Nhân viên kỹ thuật · Tuần {weekLabel}</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc trong tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/mother-ready"
            icon={ClipboardList}
            title="1. Tạo chỉ định cấy"
            deadline={`Cần hoàn thiện trong ngày Thứ 5 hàng tuần (${format(stats.thursdayDeadline, "dd/MM", { locale: vi })})`}
            percent={stats.instructionPercent}
            countLabel={`${stats.instructionDone}/${stats.instructionTotal} lô`}
          />
          <WeeklyTaskRow
            href="/alerts"
            icon={ClipboardCheck}
            title="2. Kiểm tra tình trạng cấy"
            deadline="Xử lý các chỉ định lệch % vượt ngưỡng — cần hoàn thiện trong tuần"
            percent={stats.checkPercent}
          />
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

function WeeklyTaskRow({
  href, icon: Icon, title, deadline, percent, countLabel,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  deadline: string;
  percent: number;
  countLabel?: string;
}) {
  const done = percent >= 100;
  return (
    <Link
      href={href}
      className="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 ${done ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
            <p className="text-xs text-gray-500 truncate">{deadline}</p>
          </div>
        </div>
        <Badge
          className={`shrink-0 gap-1 ${done ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}`}
        >
          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {done
            ? `Đã hoàn thành — ${countLabel ?? "100%"}`
            : `Chưa hoàn thành — ${countLabel ?? `${percent}%`}`}
        </Badge>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
        <div
          className={`rounded-full h-1.5 ${done ? "bg-green-500" : "bg-red-400"}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </Link>
  );
}

function KhoMoTaskDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getKhoMoWeeklyStats>>;
  userName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Xin chào, {userName}!</h1>
        <p className="text-gray-500 text-sm mt-1">Nhân viên kho mô</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/instructions"
            icon={Send}
            title="1. Giao mẫu mẹ theo chỉ định cấy"
            deadline={`Chỉ định tạo trước Thứ 5 tuần này cần bàn giao trước Thứ 2 tuần sau (${format(stats.nextMondayDeadline, "dd/MM", { locale: vi })})`}
            percent={stats.handoverPercent}
            countLabel={`${stats.handoverDone}/${stats.handoverTotal} chỉ định`}
          />
        </CardContent>
      </Card>

      <TodayChecklist />
    </div>
  );
}

function KhoDashboard({ stats, role }: { stats: Awaited<ReturnType<typeof getKhoMoStats>>; role: UserRole }) {
  const mauMe = stats.activeLots.find((l) => l.stage === "MAU_ME");
  const thanhPham = stats.activeLots.find((l) => l.stage === "THANH_PHAM");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan kho</h1>
        <p className="text-gray-500 text-sm mt-1">{ROLE_LABELS[role]}</p>
      </div>
      <GreetingBanner />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Bàn giao chờ xác nhận" value={stats.pendingTransfers} icon={AlertTriangle} color="yellow" />
        <StatCard title="Lô mẫu mẹ đang lưu" value={mauMe?._count ?? 0} icon={Sun} color="green" subtitle={`${mauMe?._sum?.quantity ?? 0} bình`} />
        <StatCard title="Lô thành phẩm đang lưu" value={thanhPham?._count ?? 0} icon={Package} color="blue" subtitle={`${thanhPham?._sum?.quantity ?? 0} bình`} />
      </div>
      <TodayChecklist />
    </div>
  );
}

function DefaultDashboard({ role, userName }: { role: UserRole; userName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Xin chào, {userName}!</h1>
        <p className="text-gray-500 text-sm mt-1">{ROLE_LABELS[role]}</p>
      </div>
      <GreetingBanner />
      <TodayChecklist />
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-gray-500">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Chọn một mục từ menu bên trái để bắt đầu.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, color, subtitle,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: "green" | "blue" | "yellow" | "purple" | "red";
  subtitle?: string;
}) {
  const colorMap = {
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    yellow: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value.toLocaleString("vi-VN")}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
