import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, format } from "date-fns";
import { vi } from "date-fns/locale";
import type { DailyTaskType } from "@prisma/client";
import { getDeXuatDeadline } from "@/lib/daily-task-weekly";

// Dùng chung cho trang "Phân công nhiệm vụ ngày" (bảng tiến độ) và khối "Công việc hôm nay của tôi" ở
// Dashboard NV kho thành phẩm — tổng hợp 4 nguồn việc có thể gán đích danh: GoodsReceipt (Nhận hàng NCC),
// Transfer (Nhận bàn giao từ kho sản xuất), Order (Sắp xếp đơn hàng), DailyTask (Kiểm tra cây/Đề xuất trồng-hủy).

// Tiến độ hôm nay của từng NV kho thành phẩm — "Đang chờ" = còn ở trạng thái pending bất kể gán từ ngày
// nào (Transfer/GoodsReceipt/Order có thể tồn từ hôm trước); "Đã hoàn thành hôm nay" = mốc hoàn thành rơi
// đúng hôm nay (confirmedAt/shippedAt/completedAt).
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
      select: { assignedToId: true, status: true },
    }),
    prisma.transfer.findMany({
      where: { assignedToId: { not: null }, OR: [{ status: "PENDING" }, { status: "CONFIRMED", confirmedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true },
    }),
    prisma.order.findMany({
      where: { assignedToId: { not: null }, OR: [{ status: "CONFIRMED" }, { status: "SHIPPED", shippedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true },
    }),
    prisma.dailyTask.findMany({
      where: { OR: [{ status: "PENDING" }, { status: "COMPLETED", completedAt: { gte: today, lt: tomorrow } }] },
      select: { assignedToId: true, status: true },
    }),
  ]);

  const counts = new Map<string, { pending: number; completedToday: number }>();
  const bump = (staffId: string | null, isPending: boolean) => {
    if (!staffId) return;
    const c = counts.get(staffId) ?? { pending: 0, completedToday: 0 };
    if (isPending) c.pending += 1; else c.completedToday += 1;
    counts.set(staffId, c);
  };
  goodsReceipts.forEach((r) => bump(r.assignedToId, r.status === "PLANNED"));
  transfers.forEach((r) => bump(r.assignedToId, r.status === "PENDING"));
  orders.forEach((r) => bump(r.assignedToId, r.status === "CONFIRMED"));
  dailyTasks.forEach((r) => bump(r.assignedToId, r.status === "PENDING"));

  return staffList.map((s) => {
    const c = counts.get(s.id) ?? { pending: 0, completedToday: 0 };
    const total = c.pending + c.completedToday;
    return { ...s, pending: c.pending, completedToday: c.completedToday, percent: total > 0 ? Math.round((c.completedToday / total) * 100) : null };
  });
}

export type MyTask = {
  key: string;
  href: string;
  title: string;
  description: string;
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
      select: { id: true, code: true, expectedDate: true, supplier: { select: { name: true } } },
    }),
    prisma.transfer.findMany({
      where: { assignedToId: userId, status: "PENDING" },
      select: { id: true, code: true, fromWarehouse: { select: { name: true } }, fromRoom: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { assignedToId: userId, status: "CONFIRMED" },
      select: { id: true, code: true, customerCode: true },
    }),
    prisma.dailyTask.findMany({
      where: { assignedToId: userId, status: "PENDING" },
      select: { id: true, code: true, type: true, weekStart: true, title: true, plantType: { select: { code: true, name: true } }, room: { select: { name: true } } },
    }),
  ]);

  const tasks: MyTask[] = [];
  for (const r of goodsReceipts) {
    tasks.push({
      key: `gr-${r.id}`,
      href: "/goods-receipts",
      title: `Nhận hàng NCC — ${r.code}`,
      description: `Xác nhận số liệu thật từ ${r.supplier.name}${r.expectedDate ? ` · Hàng về ${format(r.expectedDate, "dd/MM/yyyy", { locale: vi })}` : ""}`,
    });
  }
  for (const t of transfers) {
    tasks.push({
      key: `tr-${t.id}`,
      href: "/transfers/receive",
      title: `Nhận bàn giao — ${t.code}`,
      description: `Từ ${t.fromWarehouse?.name ?? ""}${t.fromRoom ? ` — ${t.fromRoom.name}` : ""}`,
    });
  }
  for (const o of orders) {
    tasks.push({ key: `or-${o.id}`, href: `/orders/pack/${o.id}`, title: `Sắp xếp đơn hàng — ${o.code}`, description: `Khách hàng ${o.customerCode}` });
  }
  for (const d of dailyTasks) {
    const isDeXuat = d.type === "DE_XUAT_TRONG_HUY";
    tasks.push({
      key: `dt-${d.id}`,
      href: "/task-assignment",
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
