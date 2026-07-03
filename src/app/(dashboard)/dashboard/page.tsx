import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package, Leaf, AlertTriangle, ShoppingCart, Users, Sun, Moon, TrendingUp,
} from "lucide-react";
import { ROLE_LABELS, LOT_STATUS_LABELS, ORDER_STATUS_LABELS, isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import TodayChecklist from "@/components/shared/today-checklist";

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

  if (role === "KHO_MO" || role === "KHO_THANH_PHAM") {
    const stats = await getKhoMoStats();
    return <KhoDashboard stats={stats} role={role} />;
  }

  return <DefaultDashboard role={role} userName={session?.user?.name ?? ""} />;
}

function AdminDashboard({ stats }: { stats: Awaited<ReturnType<typeof getAdminStats>> }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard tổng quan</h1>
        <p className="text-gray-500 text-sm mt-1">Quản trị hệ thống</p>
      </div>
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

function KhoDashboard({ stats, role }: { stats: Awaited<ReturnType<typeof getKhoMoStats>>; role: UserRole }) {
  const mauMe = stats.activeLots.find((l) => l.stage === "MAU_ME");
  const thanhPham = stats.activeLots.find((l) => l.stage === "THANH_PHAM");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan kho</h1>
        <p className="text-gray-500 text-sm mt-1">{ROLE_LABELS[role]}</p>
      </div>
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
