import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { generateDailyTaskCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek, addDays, endOfWeek, format, getWeek } from "date-fns";
import { vi } from "date-fns/locale";
import type { RoomType } from "@prisma/client";

// 3 phòng cố định của Kho thị trường (WarehouseType.THI_TRUONG, xem User.workplaceWarehouseId của
// DOI_TAC_VAN_HANH) — dùng cho việc kiểm tra định kì hàng tuần + luồng "Thực hiện" nhiệm vụ, tái dùng
// đúng cơ chế DailyTask(type=DE_XUAT_TRONG_HUY)/ContaminationProposal đã có cho Kho thành phẩm (xem
// src/lib/daily-task-weekly.ts) — CHỈ khác ở chỗ Đối tác vận hành mỗi kho chỉ có 1 người, tự động được
// giao thẳng việc, không qua bước "Quản lý phân công" như Kho thành phẩm.
export const MARKET_ROOM_TYPES: RoomType[] = ["PHONG_SAN_PHAM_DAT", "PHONG_SAN_PHAM_KHONG_DAT", "PHONG_CAY_TRONG"];

// "Kiểm tra định kì hàng tuần" của Đối tác vận hành tự sinh 1 việc/phòng (luôn đủ cả 3, không gộp theo
// Loại cây như Kho thành phẩm vì mỗi phòng ở đây đã đủ nhỏ/đơn mục đích) — tự sinh lazy mỗi lần tải
// trang giống ensureWeeklyDeXuatTask, dùng CHUNG DailyTaskType.DE_XUAT_TRONG_HUY + slotKey riêng
// (`room:<roomId>`) để không đụng slotKey `cat:*`/`market:*` của Kho thành phẩm.
export async function ensureWeeklyMarketInspectionTask(warehouseId: string | null) {
  if (!warehouseId) return;

  // Đối tác vận hành duy nhất phụ trách kho này — không có sẽ không có ai để tự gán, bỏ qua (VD kho vừa
  // tạo, chưa gán người).
  const partner = await prisma.user.findFirst({
    where: { workplaceWarehouseId: warehouseId, role: "DOI_TAC_VAN_HANH", isActive: true },
    select: { id: true },
  });
  if (!partner) return;

  const rooms = await prisma.room.findMany({
    where: { warehouseId, type: { in: MARKET_ROOM_TYPES }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (rooms.length === 0) return;

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = ` tuần ${getWeek(weekStart, { weekStartsOn: 1 })} (ngày ${format(weekStart, "dd/MM", { locale: vi })} đến ngày ${format(weekEnd, "dd/MM", { locale: vi })})`;

  const existing = await prisma.dailyTask.findMany({
    where: { type: "DE_XUAT_TRONG_HUY", warehouseId, weekStart },
    select: { slotKey: true },
  });
  const existingSlots = new Set(existing.map((t) => t.slotKey));

  const now = new Date();
  for (const room of rooms) {
    const slotKey = `room:${room.id}`;
    if (existingSlots.has(slotKey)) continue;
    await prisma.dailyTask.create({
      data: {
        code: await generateDailyTaskCode(),
        type: "DE_XUAT_TRONG_HUY",
        warehouseId,
        weekStart,
        slotKey,
        title: `Kiểm tra ${room.name}${weekLabel}`,
        roomId: room.id,
        // Tự động giao thẳng cho Đối tác vận hành — không qua bước "Quản lý phân công" (mỗi kho chỉ 1
        // người phụ trách, khác Kho thành phẩm nhiều NV). assignmentConfirmedAt set sẵn để bỏ qua luôn
        // bước "Xác nhận nhận việc" (xem KhoDashboard/ConfirmTaskButton) — việc tự hiện thẳng ra là chờ
        // thực hiện.
        assignedToId: partner.id,
        assignmentConfirmedAt: now,
        notes: "Tự động tạo hàng tuần, tự động giao cho Đối tác vận hành phụ trách kho này.",
      },
    });
  }

  // Nhắc hạn từ Thứ 4 — hạn hoàn thành trước Thứ 6 tuần này, cùng quy ước với Kho thành phẩm (xem
  // ensureWeeklyDeXuatTask), 1 lần/tuần/việc (dedup qua relatedId).
  const wednesday = addDays(weekStart, 2);
  if (now >= wednesday) {
    const tasksThisWeek = await prisma.dailyTask.findMany({
      where: { type: "DE_XUAT_TRONG_HUY", warehouseId, weekStart, status: "PENDING" },
      select: { slotKey: true, code: true, title: true },
    });
    for (const t of tasksThisWeek) {
      if (!t.slotKey) continue;
      const relatedId = `weekly-de-xuat:${warehouseId}:${format(weekStart, "yyyy-MM-dd")}:${t.slotKey}`;
      const sent = await prisma.alert.findFirst({ where: { type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE", relatedId } });
      if (!sent) {
        await createAlert({
          type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE",
          title: "Nhắc hạn: Kiểm tra định kì hàng tuần",
          message: `Cần hoàn thành "${t.title ?? t.code}" trước Thứ Sáu tuần này.`,
          userId: partner.id,
          relatedId,
          relatedType: "DailyTask",
        });
      }
    }
  }
}
