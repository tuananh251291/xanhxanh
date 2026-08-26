import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, format } from "date-fns";
import { vi } from "date-fns/locale";
import type { DailyTaskType } from "@prisma/client";
import { getDeXuatDeadline } from "@/lib/daily-task-weekly";

// Dùng chung cho trang "Phân công nhiệm vụ ngày" (bảng tiến độ) và khối "Công việc hôm nay của tôi" ở
// Dashboard NV kho thành phẩm — tổng hợp 4 nguồn việc có thể gán đích danh: GoodsReceipt (Nhận hàng NCC),
// Transfer (Nhận bàn giao từ kho sản xuất), Order (Sắp xếp đơn hàng), DailyTask (Kiểm tra cây/Đề xuất trồng-hủy).

// Tiến độ của từng NV kho thành phẩm — tách 2 trục độc lập:
// - notAcked/ackedToday: NV đã bấm "Xác nhận" nhận việc (assignmentConfirmedAt) chưa — notAcked đếm
//   TOÀN BỘ việc đang pending chưa xác nhận (không tính theo ngày), ackedToday đếm việc xác nhận đúng
//   hôm nay (mốc thời gian, giống completedToday).
// - notCompleted/completedToday: việc bản thân đã xong chưa — y hệt logic "pending/completedToday" cũ.
export async function getStaffTaskProgressToday(warehouseId: string | null) {
  const today = startOfDay(new Date());
  const tomorrow = endOfDay(new Date());

  const staffList = await prisma.user.findMany({
    where: {
      role: { in: ["KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM"] },
      ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  const [goodsReceipts, transfers, orders, dailyTasks] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: { assignedToId: { not: null }, OR: [{ status: "PLANNED" }, { status: "CONFIRMED", confirmedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true, assignmentConfirmedAt: true },
    }),
    prisma.transfer.findMany({
      where: { assignedToId: { not: null }, OR: [{ status: "PENDING" }, { status: "CONFIRMED", confirmedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true, assignmentConfirmedAt: true },
    }),
    prisma.order.findMany({
      where: { assignedToId: { not: null }, OR: [{ status: "CONFIRMED" }, { status: "SHIPPED", shippedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true, assignmentConfirmedAt: true },
    }),
    prisma.dailyTask.findMany({
      where: { OR: [{ status: "PENDING" }, { status: "COMPLETED", completedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true, assignmentConfirmedAt: true },
    }),
  ]);

  const counts = new Map<string, { notAcked: number; ackedToday: number; notCompleted: number; completedToday: number }>();
  const bump = (staffId: string | null, isPending: boolean, assignmentConfirmedAt: Date | null) => {
    if (!staffId) return;
    const c = counts.get(staffId) ?? { notAcked: 0, ackedToday: 0, notCompleted: 0, completedToday: 0 };
    if (isPending) {
      c.notCompleted += 1;
      if (!assignmentConfirmedAt) c.notAcked += 1;
    } else {
      c.completedToday += 1;
    }
    if (assignmentConfirmedAt && assignmentConfirmedAt >= today && assignmentConfirmedAt < tomorrow) c.ackedToday += 1;
    counts.set(staffId, c);
  };
  goodsReceipts.forEach((r) => bump(r.assignedToId, r.status === "PLANNED", r.assignmentConfirmedAt));
  transfers.forEach((r) => bump(r.assignedToId, r.status === "PENDING", r.assignmentConfirmedAt));
  orders.forEach((r) => bump(r.assignedToId, r.status === "CONFIRMED", r.assignmentConfirmedAt));
  dailyTasks.forEach((r) => bump(r.assignedToId, r.status === "PENDING", r.assignmentConfirmedAt));

  return staffList.map((s) => {
    const c = counts.get(s.id) ?? { notAcked: 0, ackedToday: 0, notCompleted: 0, completedToday: 0 };
    const total = c.notCompleted + c.completedToday;
    return { ...s, ...c, percent: total > 0 ? Math.round((c.completedToday / total) * 100) : null };
  });
}

export type OutstandingTask = {
  key: string;
  title: string;
  createdAt: Date;
  assignedTo: { code: string; name: string } | null;
  confirmedAt: Date | null;
};

// Danh sách phẳng mọi việc CHƯA hoàn thành (bất kể đã gán hay chưa, đã xác nhận hay chưa) — dùng cho mục
// "Danh sách công việc còn tồn đọng" ở /task-progress. Cùng 4 nguồn + cùng điều kiện lọc kho như trang
// "Phân công nhiệm vụ ngày" (xem task-assignment/page.tsx) để 2 trang luôn khớp nhau. createdAt dùng làm
// "ngày giao" xấp xỉ — hệ thống không lưu mốc riêng lúc Quản lý bấm gán cho từng NV.
export async function getOutstandingTasks(warehouseId: string | null): Promise<OutstandingTask[]> {
  const [goodsReceipts, transfers, orders, dailyTasks] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: { status: "PLANNED", room: { warehouseId: warehouseId ?? "" } },
      select: { id: true, code: true, createdAt: true, assignmentConfirmedAt: true, assignedTo: { select: { code: true, name: true } } },
    }),
    prisma.transfer.findMany({
      where: { status: "PENDING", toWarehouse: { type: "THANH_PHAM" } },
      select: { id: true, code: true, createdAt: true, assignmentConfirmedAt: true, assignedTo: { select: { code: true, name: true } } },
    }),
    prisma.order.findMany({
      where: { status: "CONFIRMED" },
      select: { id: true, code: true, customerCode: true, createdAt: true, assignmentConfirmedAt: true, assignedTo: { select: { code: true, name: true } } },
    }),
    prisma.dailyTask.findMany({
      where: { status: "PENDING" },
      select: {
        id: true, code: true, type: true, title: true, createdAt: true, assignmentConfirmedAt: true,
        assignedTo: { select: { code: true, name: true } },
        plantType: { select: { code: true, name: true } },
        room: { select: { name: true } },
      },
    }),
  ]);

  const tasks: OutstandingTask[] = [];
  for (const r of goodsReceipts) {
    tasks.push({ key: `gr-${r.id}`, title: `Nhận hàng NCC — ${r.code}`, createdAt: r.createdAt, assignedTo: r.assignedTo, confirmedAt: r.assignmentConfirmedAt });
  }
  for (const t of transfers) {
    tasks.push({ key: `tr-${t.id}`, title: `Nhận bàn giao — ${t.code}`, createdAt: t.createdAt, assignedTo: t.assignedTo, confirmedAt: t.assignmentConfirmedAt });
  }
  for (const o of orders) {
    tasks.push({ key: `or-${o.id}`, title: `Sắp xếp đơn hàng — ${o.code} (KH ${o.customerCode})`, createdAt: o.createdAt, assignedTo: o.assignedTo, confirmedAt: o.assignmentConfirmedAt });
  }
  for (const d of dailyTasks) {
    const isDeXuat = d.type === "DE_XUAT_TRONG_HUY";
    const label = isDeXuat
      ? (d.title ?? d.code)
      : `Kiểm tra cây — ${d.code}${d.plantType ? ` (${d.plantType.name})` : d.room ? ` (${d.room.name})` : ""}`;
    tasks.push({ key: `dt-${d.id}`, title: label, createdAt: d.createdAt, assignedTo: d.assignedTo, confirmedAt: d.assignmentConfirmedAt });
  }
  return tasks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export type MyTask = {
  key: string;
  href: string;
  title: string;
  description: string;
  // Endpoint REST của chính bản ghi (GoodsReceipt/Transfer/Order/DailyTask) — dùng cho nút "Xác nhận"
  // ở Dashboard (PATCH { action: "ack" }, xem ConfirmTaskButton).
  endpoint: string;
  // NULL = NV chưa bấm "Xác nhận" nhận việc — Quản lý vẫn đổi được người phụ trách (khoá lại sau khi có
  // giá trị, xem KhoTpAssignCell + PATCH action=assign của 4 route).
  confirmedAt: Date | null;
  // Chỉ có giá trị với 2 loại DailyTask (Kiểm tra cây/Đề xuất trồng-hủy) — không có trang riêng để xử lý
  // như 3 loại còn lại, nên NV hoàn thành trực tiếp qua DailyTaskCompleteDialog ngay tại Dashboard thay vì
  // đi tới href (href chỉ trỏ về /task-assignment để tham khảo, trang đó chỉ Quản lý mới vào được).
  dailyTaskId?: string;
  dailyTaskCode?: string;
  dailyTaskType?: DailyTaskType;
};

// Việc đang chờ gán cho ĐÚNG 1 NV (dashboard NV kho thành phẩm, khối "Công việc hôm nay của tôi") — 3
// loại đã có trang riêng để xử lý (link thẳng tới đó), riêng DailyTask hoàn thành ngay tại Dashboard qua
// dialog nên có thêm dailyTaskId.
export async function getMyPendingTasks(userId: string): Promise<MyTask[]> {
  const [goodsReceipts, transfers, orders, dailyTasks] = await Promise.all([
    // Chỉ hiện từ đúng "Ngày hàng về" (expectedDate) trở đi — kế hoạch nhập kho tạo/gán trước cả tuần
    // vẫn chưa cần NV làm gì tới lúc đó, tránh hiện sớm gây rối bảng "Công việc hôm nay của tôi".
    prisma.goodsReceipt.findMany({
      where: { assignedToId: userId, status: "PLANNED", expectedDate: { lte: endOfDay(new Date()) } },
      select: { id: true, code: true, expectedDate: true, assignmentConfirmedAt: true, supplier: { select: { name: true } } },
    }),
    prisma.transfer.findMany({
      where: { assignedToId: userId, status: "PENDING" },
      select: { id: true, code: true, assignmentConfirmedAt: true, fromWarehouse: { select: { name: true } }, fromRoom: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { assignedToId: userId, status: "CONFIRMED" },
      select: { id: true, code: true, customerCode: true, assignmentConfirmedAt: true },
    }),
    prisma.dailyTask.findMany({
      where: { assignedToId: userId, status: "PENDING" },
      select: { id: true, code: true, type: true, weekStart: true, title: true, assignmentConfirmedAt: true, plantType: { select: { code: true, name: true } }, room: { select: { name: true } } },
    }),
  ]);

  const tasks: MyTask[] = [];
  for (const r of goodsReceipts) {
    tasks.push({
      key: `gr-${r.id}`,
      href: `/goods-receipts?confirmId=${r.id}`,
      endpoint: `/api/goods-receipts/${r.id}`,
      confirmedAt: r.assignmentConfirmedAt,
      title: `Nhận hàng NCC — ${r.code}`,
      description: `Xác nhận số liệu thật từ ${r.supplier.name}${r.expectedDate ? ` · Hàng về ${format(r.expectedDate, "dd/MM/yyyy", { locale: vi })}` : ""}`,
    });
  }
  for (const t of transfers) {
    tasks.push({
      key: `tr-${t.id}`,
      href: "/transfers/receive",
      endpoint: `/api/transfers/${t.id}`,
      confirmedAt: t.assignmentConfirmedAt,
      title: `Nhận bàn giao — ${t.code}`,
      description: `Từ ${t.fromWarehouse?.name ?? ""}${t.fromRoom ? ` — ${t.fromRoom.name}` : ""}`,
    });
  }
  for (const o of orders) {
    tasks.push({
      key: `or-${o.id}`,
      href: `/orders/pack/${o.id}`,
      endpoint: `/api/orders/${o.id}`,
      confirmedAt: o.assignmentConfirmedAt,
      title: `Sắp xếp đơn hàng — ${o.code}`,
      description: `Khách hàng ${o.customerCode}`,
    });
  }
  for (const d of dailyTasks) {
    const isDeXuat = d.type === "DE_XUAT_TRONG_HUY";
    tasks.push({
      key: `dt-${d.id}`,
      href: "/task-assignment",
      endpoint: `/api/daily-tasks/${d.id}`,
      confirmedAt: d.assignmentConfirmedAt,
      title: isDeXuat ? (d.title ?? d.code) : `Kiểm tra cây — ${d.code}`,
      description: isDeXuat
        ? (d.weekStart ? `Hạn hoàn thành: ${format(getDeXuatDeadline(d.weekStart), "dd/MM/yyyy", { locale: vi })} (Thứ Sáu)` : "")
        : (d.plantType ? `${d.plantType.name} (${d.plantType.code})` : d.room ? d.room.name : ""),
      dailyTaskId: d.id,
      dailyTaskCode: d.code,
      dailyTaskType: d.type,
    });
  }
  return tasks;
}
