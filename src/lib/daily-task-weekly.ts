import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { generateDailyTaskCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek, addDays, format } from "date-fns";

// "Kiểm nhiễm - Đề xuất trồng/hủy" — 4 Loại cây chính có việc riêng, các Loại cây còn lại gộp chung 1
// việc (danh sách còn lại tính động theo PlantCategory hiện có, không hardcode ngoài 4 mã này).
const PRIMARY_CATEGORY_CODES = ["MT", "AL", "PD", "AT"];

// Hạn hoàn thành của việc tuần này — Thứ Sáu (weekStart = Thứ 2, +4 ngày).
export function getDeXuatDeadline(weekStart: Date): Date {
  return addDays(weekStart, 4);
}

type WeeklyTarget = { slotKey: string; title: string; plantCategoryCodes: string[]; roomId: string | null };

// 1 "kho cây" = 1 việc riêng trong tuần: 4 Loại cây chính (MT/AL/PD/AT), 1 việc gộp mọi Loại cây còn lại,
// và 1 việc/Phòng thị trường đang hoạt động của đúng kho thành phẩm này (tự thêm khi có kho thị trường mới).
async function buildWeeklyTargets(warehouseId: string): Promise<WeeklyTarget[]> {
  const categories = await prisma.plantCategory.findMany({
    where: { isActive: true },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
  const primary = PRIMARY_CATEGORY_CODES
    .map((code) => categories.find((c) => c.code === code))
    .filter((c): c is { code: string; name: string } => !!c);
  const others = categories.filter((c) => !PRIMARY_CATEGORY_CODES.includes(c.code));

  const marketRooms = await prisma.room.findMany({
    where: { warehouseId, type: "PHONG_THI_TRUONG", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const targets: WeeklyTarget[] = primary.map((c) => ({
    slotKey: `cat:${c.code}`,
    title: `Kiểm tra kho cây ${c.code} - ${c.name}`,
    plantCategoryCodes: [c.code],
    roomId: null,
  }));

  if (others.length > 0) {
    targets.push({
      slotKey: "cat:OTHER",
      title: `Kiểm tra kho cây ${others.map((c) => c.code).join(", ")} - Các loại còn lại`,
      plantCategoryCodes: others.map((c) => c.code),
      roomId: null,
    });
  }

  for (const r of marketRooms) {
    targets.push({ slotKey: `market:${r.id}`, title: `Kiểm tra kho cây thị trường ${r.name}`, plantCategoryCodes: [], roomId: r.id });
  }

  return targets;
}

// "Kiểm nhiễm - Đề xuất trồng/hủy" tự sinh NHIỀU việc/tuần (1 việc/kho cây, xem buildWeeklyTargets) cho
// Kho thành phẩm — không có cron thật trong app này, tính lazy mỗi lần tải trang giống mọi hàm ensureXxx
// khác (xem src/app/(dashboard)/layout.tsx). weekStart dùng đúng chuẩn hoá toStoredWeekStart() như
// PlantingInstruction.weekStart; slotKey (kèm @@unique) đảm bảo không tạo trùng việc cho cùng 1 kho cây
// trong cùng 1 tuần dù người dùng tải trang nhiều lần.
export async function ensureWeeklyDeXuatTask(warehouseId: string | null) {
  if (!warehouseId) return;
  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const targets = await buildWeeklyTargets(warehouseId);

  const existing = await prisma.dailyTask.findMany({
    where: { type: "DE_XUAT_TRONG_HUY", warehouseId, weekStart },
    select: { slotKey: true, status: true, assignedToId: true, code: true, title: true },
  });
  const existingSlots = new Set(existing.map((t) => t.slotKey));
  const tasksThisWeek = [...existing];

  for (const target of targets) {
    if (existingSlots.has(target.slotKey)) continue;
    const created = await prisma.dailyTask.create({
      data: {
        code: await generateDailyTaskCode(),
        type: "DE_XUAT_TRONG_HUY",
        warehouseId,
        weekStart,
        slotKey: target.slotKey,
        title: target.title,
        plantCategoryCodes: target.plantCategoryCodes,
        roomId: target.roomId,
        notes: "Tự động tạo hàng tuần — Quản lý chọn NV phụ trách bên dưới.",
      },
      select: { slotKey: true, status: true, assignedToId: true, code: true, title: true },
    });
    tasksThisWeek.push(created);
  }

  // Nhắc hạn từ Thứ 4 — hạn hoàn thành trước Thứ 6 tuần này — 1 lần/tuần/việc (dedup qua relatedId),
  // giống ensureCustomerStatusReminders.
  const wednesday = addDays(weekStart, 2);
  if (new Date() >= wednesday) {
    for (const t of tasksThisWeek) {
      if (t.status !== "PENDING" || !t.slotKey) continue;
      const relatedId = `weekly-de-xuat:${warehouseId}:${format(weekStart, "yyyy-MM-dd")}:${t.slotKey}`;
      const sent = await prisma.alert.findFirst({ where: { type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE", relatedId } });
      if (!sent) {
        await createAlert({
          type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE",
          title: "Nhắc hạn: Kiểm nhiễm - Đề xuất trồng/hủy",
          message: `Cần hoàn thành "${t.title ?? t.code}" trước Thứ Sáu tuần này.`,
          ...(t.assignedToId ? { userId: t.assignedToId } : { targetRole: "QUAN_LY_KHO_THANH_PHAM" as const }),
          relatedId,
          relatedType: "DailyTask",
        });
      }
    }
  }
}

// Nhiệm vụ DE_XUAT_TRONG_HUY chỉ tính hoàn thành khi TOÀN BỘ ContaminationProposal liên kết (xem
// dailyTaskId) đã được Admin Duyệt — không phải lúc NV gửi. Tính lazy, không hook vào route duyệt.
export async function ensureDeXuatTaskCompletion(warehouseId: string | null) {
  const pending = await prisma.dailyTask.findMany({
    where: { type: "DE_XUAT_TRONG_HUY", status: "PENDING", ...(warehouseId ? { warehouseId } : {}) },
    include: { proposals: { select: { status: true } } },
  });
  for (const t of pending) {
    if (t.proposals.length > 0 && t.proposals.every((p) => p.status === "APPROVED")) {
      await prisma.dailyTask.update({ where: { id: t.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
  }
}
