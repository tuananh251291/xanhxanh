import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package, Leaf, AlertTriangle, ShoppingCart, Users, Sun, Moon, TrendingUp,
  PackageCheck, PenLine, Send, CheckCircle2, XCircle, ClipboardList, ClipboardCheck, FlaskConical, type LucideIcon,
} from "lucide-react";
import { ROLE_LABELS, LOT_STATUS_LABELS, ORDER_STATUS_LABELS, isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import { formatDistanceToNow, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays, addWeeks, format } from "date-fns";
import { vi } from "date-fns/locale";
import TodayChecklist from "@/components/shared/today-checklist";
import ProductivityLeaderboard from "@/components/shared/productivity-leaderboard";
import { isMediumOrderInProgress } from "@/lib/medium-orders";
import { randomGreetingQuote } from "@/lib/greetings";
import { getInspectionDueAt } from "@/lib/inspection";

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

async function getCayMoStats(userId: string) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [pendingMotherReceipt, dailyRecordToday, uninspectedDarkRoomLots, handoverToday] = await Promise.all([
    // Chỉ tính trên các chỉ định Kho mô đã bàn giao (handedOverAt) — chỉ định "Chưa bàn giao" không
    // tính vào đánh giá vì NV cấy mô chưa có gì để xác nhận.
    prisma.plantingInstruction.findFirst({
      where: { assignedToId: userId, handedOverAt: { not: null }, motherReceivedAt: null },
    }),
    prisma.dailyRecord.findFirst({
      where: { staffId: userId, recordDate: { gte: todayStart, lte: todayEnd } },
    }),
    // "Kiểm tra nhiễm phòng tối" chỉ hoàn thành khi không còn lô nào ở phòng tối cá nhân của NV bị QUÁ
    // HẠN kiểm tra (xem getInspectionDueAt) — lô mới nhập, chưa tới hạn thì không chặn việc này. Cùng
    // phạm vi lô với /api/lots?roomType=PHONG_TOI (xem my-dark-room/page.tsx): gắn thẳng vào Room qua
    // roomId, không qua Shelf.
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        instruction: { assignedToId: userId },
        inspectedAt: null,
        room: { type: "PHONG_TOI" },
      },
      select: { enteredAt: true },
    }),
    prisma.transfer.findFirst({
      where: {
        fromUserId: userId,
        fromRoom: { type: "PHONG_TOI" },
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    }),
  ]);

  const now = new Date();
  const hasOverdueDarkRoomLot = uninspectedDarkRoomLots.some((lot) => getInspectionDueAt(lot.enteredAt) <= now);

  return {
    motherReceived: !pendingMotherReceipt,
    dailyRecordDone: !!dailyRecordToday,
    contaminationChecked: !hasOverdueDarkRoomLot,
    handoverDone: !!handoverToday,
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
// Các công việc "hàng tuần" khác (bàn giao thành phẩm/nhận môi trường/đề xuất nhiễm) không có hạn chót
// cố định như việc 1 — tạm tính % theo tỉ lệ đã xử lý/tổng phát sinh trong tuần (hoặc lượng tồn còn lại
// với Phòng nhiễm), có thể cần NV nghiệp vụ mô tả rõ hơn để điều chỉnh sau.
async function getKhoMoWeeklyStats(workplaceWarehouseId: string | null) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thursdayDeadline = addDays(weekStart, 3);
  const nextMondayDeadline = addWeeks(weekStart, 1);

  const [dueInstructions, finishedTransfers, mediumDays, contaminationLots] = await Promise.all([
    prisma.plantingInstruction.findMany({
      where: {
        createdAt: { lte: thursdayDeadline },
        ...(workplaceWarehouseId ? { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } : {}),
      },
      select: { handedOverAt: true },
    }),
    // Bàn giao thành phẩm: phiếu Transfer từ Phòng ra rễ tạo trong tuần này — Kho thành phẩm xác nhận
    // (CONFIRMED) coi là xong.
    prisma.transfer.findMany({
      where: {
        fromRoom: { type: "PHONG_RA_RE", ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}) },
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      select: { status: true },
    }),
    // Nhận môi trường: ngày môi trường đã được NV môi trường bàn giao (handedOverAt) trong tuần này —
    // Kho mô xác nhận (confirmedAt) coi là xong.
    prisma.mediumOrderDay.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        handedOverAt: { not: null },
        ...(workplaceWarehouseId
          ? { order: { instructions: { some: { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } } } }
          : {}),
      },
      select: { confirmedAt: true },
    }),
    // Đề xuất Trồng/Hủy: lô còn tồn trong Phòng nhiễm của kho này — hết tồn nghĩa là đã gửi đề xuất xử lý
    // hết (xem lib/contamination-room.ts — số lượng bị trừ ngay khỏi Phòng nhiễm lúc gửi đề xuất).
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        room: { type: "PHONG_NHIEM", ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}) },
      },
      select: { quantity: true },
    }),
  ]);

  const handoverTotal = dueInstructions.length;
  const handoverDone = dueInstructions.filter((i) => i.handedOverAt !== null).length;
  const handoverPercent = handoverTotal === 0 ? 100 : Math.round((handoverDone / handoverTotal) * 100);

  const finishedTotal = finishedTransfers.length;
  const finishedDone = finishedTransfers.filter((t) => t.status === "CONFIRMED").length;
  const finishedPercent = finishedTotal === 0 ? 100 : Math.round((finishedDone / finishedTotal) * 100);

  const mediumTotal = mediumDays.length;
  const mediumDone = mediumDays.filter((d) => d.confirmedAt !== null).length;
  const mediumPercent = mediumTotal === 0 ? 100 : Math.round((mediumDone / mediumTotal) * 100);

  const contaminationOutstanding = contaminationLots.reduce((sum, l) => sum + l.quantity, 0);
  const contaminationPercent = contaminationOutstanding === 0 ? 100 : 0;

  return {
    weekStart, weekEnd, nextMondayDeadline,
    handoverDone, handoverTotal, handoverPercent,
    finishedDone, finishedTotal, finishedPercent,
    mediumDone, mediumTotal, mediumPercent,
    contaminationOutstanding, contaminationPercent,
  };
}

// Việc "hàng ngày" của Kho mô: xác nhận các phiếu bàn giao từ Phòng tối cá nhân (NV cấy mô gửi lên) được
// tạo trong ngày — cùng phạm vi lọc phiếu với GET /api/transfers cho KHO_MO (toUserId null + đúng kho).
async function getKhoMoDailyStats(workplaceWarehouseId: string | null) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const transfersToday = await prisma.transfer.findMany({
    where: {
      toUserId: null,
      fromRoom: { type: "PHONG_TOI", ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}) },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { status: true },
  });

  const receiveTotal = transfersToday.length;
  const receiveDone = transfersToday.filter((t) => t.status === "CONFIRMED").length;
  const receivePercent = receiveTotal === 0 ? 100 : Math.round((receiveDone / receiveTotal) * 100);

  return { receiveDone, receiveTotal, receivePercent };
}

// Đơn "đang xử lý" của NV môi trường = đơn do chính họ xác nhận, chưa kết thúc (xem
// isMediumOrderInProgress) — dùng để hiện thẳng lên dashboard, giống trang "Bàn giao môi trường".
async function getMoiTruongStats(userId: string, workplaceWarehouseId: string | null) {
  const [myOrders, pendingOrders] = await Promise.all([
    prisma.mediumOrder.findMany({
      where: { confirmedById: userId, confirmedAt: { not: null } },
      include: { days: { select: { handedOverAt: true, confirmedAt: true } } },
      orderBy: { confirmedAt: "desc" },
    }),
    prisma.mediumOrder.count({
      where: {
        confirmedAt: null,
        ...(workplaceWarehouseId ? { instructions: { some: { items: { some: { shelf: { warehouseId: workplaceWarehouseId } } } } } } : {}),
      },
    }),
  ]);
  const activeOrder = myOrders.find((o) => isMediumOrderInProgress(o)) ?? null;
  return { activeOrder, pendingOrders };
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
    const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
    const [weeklyStats, dailyStats] = await Promise.all([
      getKhoMoWeeklyStats(workplaceWarehouseId),
      getKhoMoDailyStats(workplaceWarehouseId),
    ]);
    return <KhoMoTaskDashboard weeklyStats={weeklyStats} dailyStats={dailyStats} userName={session?.user?.name ?? ""} />;
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

  if (role === "MOI_TRUONG") {
    const stats = await getMoiTruongStats(userId, session?.user?.workplaceWarehouseId ?? null);
    return <MoiTruongDashboard stats={stats} userName={session?.user?.name ?? ""} />;
  }

  return <DefaultDashboard role={role} userName={session?.user?.name ?? ""} />;
}

function GreetingBanner() {
  return (
    <p className="text-sm font-bold text-primary-strong bg-primary-light border border-primary-light rounded-lg px-3 py-2">
      {randomGreetingQuote()}
    </p>
  );
}

function AdminDashboard({ stats }: { stats: Awaited<ReturnType<typeof getAdminStats>> }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard tổng quan</h1>
        <p className="text-text-secondary text-sm mt-1">Quản trị hệ thống</p>
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
              <AlertTriangle className="w-4 h-4 text-warning-foreground" />
              Cảnh báo chưa đọc ({stats.recentAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start justify-between p-3 bg-warning-light rounded-lg border border-warning-light">
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.title}</p>
                    <p className="text-xs text-text-secondary">{alert.message}</p>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap ml-4">
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
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên sale</p>
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
                <div key={order.id} className="flex items-center justify-between p-3 bg-background rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{order.code}</p>
                    <p className="text-xs text-text-secondary">{order.customerName}</p>
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
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1 capitalize">Nhân viên nuôi cấy mô · {today}</p>
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
            icon={Moon}
            title="3. Kiểm tra nhiễm phòng tối"
            description="Kiểm tra và báo cáo nhiễm các lô trong phòng tối"
            done={stats.contaminationChecked}
          />
          <TaskRow
            href="/product-handover"
            icon={Send}
            title="4. Bàn giao sản phẩm"
            description="Bàn giao lô từ phòng tối cho Kho mô"
            done={stats.handoverDone}
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
      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-primary-light transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2.5 rounded-xl shrink-0 ${done ? "bg-primary-light text-primary-strong" : "bg-danger-light text-destructive"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <p className="text-xs text-text-secondary truncate">{description}</p>
        </div>
      </div>
      <Badge
        className={`shrink-0 gap-1 ${done ? "bg-primary-light text-primary-strong hover:bg-primary-light" : "bg-danger-light text-destructive hover:bg-danger-light"}`}
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
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên kỹ thuật · Tuần {weekLabel}</p>
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
      className="block p-3 rounded-lg border border-border hover:bg-primary-light transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 ${done ? "bg-primary-light text-primary-strong" : "bg-danger-light text-destructive"}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            <p className="text-xs text-text-secondary truncate">{deadline}</p>
          </div>
        </div>
        <Badge
          className={`shrink-0 gap-1 ${done ? "bg-primary-light text-primary-strong hover:bg-primary-light" : "bg-danger-light text-destructive hover:bg-danger-light"}`}
        >
          {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {done
            ? `Đã hoàn thành — ${countLabel ?? "100%"}`
            : `Chưa hoàn thành — ${countLabel ?? `${percent}%`}`}
        </Badge>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 mt-3">
        <div
          className={`rounded-full h-1.5 ${done ? "bg-primary" : "bg-destructive"}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </Link>
  );
}

function KhoMoTaskDashboard({
  weeklyStats, dailyStats, userName,
}: {
  weeklyStats: Awaited<ReturnType<typeof getKhoMoWeeklyStats>>;
  dailyStats: Awaited<ReturnType<typeof getKhoMoDailyStats>>;
  userName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên kho mô</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng ngày</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/transfers/receive"
            icon={PackageCheck}
            title="1. Nhận bàn giao từ kho tối"
            deadline="Xác nhận các phiếu bàn giao từ phòng tối cá nhân gửi lên trong ngày"
            percent={dailyStats.receivePercent}
            countLabel={`${dailyStats.receiveDone}/${dailyStats.receiveTotal} phiếu`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Công việc hàng tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeeklyTaskRow
            href="/instructions"
            icon={Send}
            title="1. Giao mẫu mẹ theo chỉ định cấy"
            deadline={`Chỉ định tạo trước Thứ 5 tuần này cần bàn giao trước Thứ 2 tuần sau (${format(weeklyStats.nextMondayDeadline, "dd/MM", { locale: vi })})`}
            percent={weeklyStats.handoverPercent}
            countLabel={`${weeklyStats.handoverDone}/${weeklyStats.handoverTotal} chỉ định`}
          />
          <WeeklyTaskRow
            href="/transfers/finished"
            icon={Package}
            title="2. Bàn giao thành phẩm"
            deadline="Xác nhận Kho thành phẩm đã nhận các phiếu bàn giao từ Phòng ra rễ trong tuần"
            percent={weeklyStats.finishedPercent}
            countLabel={`${weeklyStats.finishedDone}/${weeklyStats.finishedTotal} phiếu`}
          />
          <WeeklyTaskRow
            href="/medium-orders/receive"
            icon={FlaskConical}
            title="3. Nhận môi trường"
            deadline="Xác nhận các ngày môi trường đã được NV môi trường bàn giao trong tuần"
            percent={weeklyStats.mediumPercent}
            countLabel={`${weeklyStats.mediumDone}/${weeklyStats.mediumTotal} ngày`}
          />
          <WeeklyTaskRow
            href="/contamination-proposals"
            icon={AlertTriangle}
            title="4. Đề xuất Trồng/Hủy"
            deadline="Gửi đề xuất xử lý hết số lượng đang tồn trong Phòng nhiễm"
            percent={weeklyStats.contaminationPercent}
            countLabel={
              weeklyStats.contaminationOutstanding === 0
                ? "Đã xử lý hết"
                : `${weeklyStats.contaminationOutstanding.toLocaleString("vi-VN")} còn tồn`
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MoiTruongDashboard({
  stats, userName,
}: {
  stats: Awaited<ReturnType<typeof getMoiTruongStats>>;
  userName: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">Nhân viên môi trường</p>
      </div>
      <GreetingBanner />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bàn giao môi trường</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.activeOrder ? (
            <Link
              href={`/medium-orders/${stats.activeOrder.id}`}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-primary-light transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl shrink-0 bg-warning-light text-warning-foreground">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate font-mono">{stats.activeOrder.code}</p>
                  <p className="text-xs text-text-secondary truncate">Đơn đang xử lý — bấm để xem chi tiết và bàn giao</p>
                </div>
              </div>
              <Badge className="bg-warning-light text-warning-foreground shrink-0">Đang thực hiện</Badge>
            </Link>
          ) : (
            <div className="text-center py-6 text-text-secondary">
              <FlaskConical className="w-8 h-8 mx-auto mb-2 text-text-muted" />
              <p className="text-sm">Không có đơn sản xuất môi trường nào đang xử lý</p>
            </div>
          )}
          {stats.pendingOrders > 0 && (
            <p className="text-xs text-text-muted mt-3">
              Có {stats.pendingOrders} đơn đang chờ xác nhận —{" "}
              <Link href="/medium-orders" className="text-primary-strong hover:underline font-medium">xem danh sách</Link>
            </p>
          )}
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
        <h1 className="text-2xl font-bold text-foreground">Tổng quan kho</h1>
        <p className="text-text-secondary text-sm mt-1">{ROLE_LABELS[role]}</p>
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
        <h1 className="text-2xl font-bold text-foreground">Xin chào, {userName}!</h1>
        <p className="text-text-secondary text-sm mt-1">{ROLE_LABELS[role]}</p>
      </div>
      <GreetingBanner />
      <TodayChecklist />
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-text-secondary">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-text-muted" />
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
    green: "bg-primary-light text-primary-strong",
    blue: "bg-info-light text-info-foreground",
    yellow: "bg-warning-light text-warning-foreground",
    purple: "bg-violet-light text-violet-foreground",
    red: "bg-danger-light text-destructive",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value.toLocaleString("vi-VN")}</p>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
