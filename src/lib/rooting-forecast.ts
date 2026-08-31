import { format, startOfMonth, getDay, addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";

// Nhiệm vụ tháng "Dự kiến đáp ứng cây ra rễ" cho NV Kỹ thuật — mỗi cơ sở sản xuất (Warehouse SAN_XUAT,
// gán qua User.workplaceWarehouseId) có 1 vòng nhập liệu/tháng, NV điền số cây ra rễ dự kiến đáp ứng được
// THÁNG KẾ TIẾP, cho từng mã cây đang hoạt động tại cơ sở đó — MỖI mã cây có thể gán cho NHIỀU NV cấy mô
// khác nhau (mỗi người 1 dòng riêng, xem RootingForecastEntry). Hạn hoàn thành ngày 15 của taskMonth (dời
// sang 16 nếu 15 là Chủ nhật). Không có bảng "Task" riêng lưu trạng thái — mọi thứ tính LIVE từ
// RootingForecastEntry (xem prisma/schema.prisma), giống triết lý getKyThuatStats
// (src/app/(dashboard)/dashboard/page.tsx).

// yyyy-MM-01 UTC-midnight của tháng chứa `date` — cùng kỹ thuật với toStoredWeekStart
// (src/lib/week-rotation.ts) để so khớp đúng dù server ở múi giờ nào.
export function getTaskMonth(date: Date = new Date()): Date {
  return new Date(format(startOfMonth(date), "yyyy-MM-dd"));
}

// Hạn hoàn thành — ngày 15 của taskMonth, dời sang 16 nếu 15 rơi Chủ nhật (getDay === 0).
export function getForecastDeadline(taskMonth: Date): Date {
  const day15 = new Date(taskMonth.getFullYear(), taskMonth.getMonth(), 15);
  return getDay(day15) === 0 ? addDays(day15, 1) : day15;
}

// Mã cây đang hoạt động tại 1 cơ sở sản xuất — cùng cách lọc đã có tiền lệ ở getRelevantPlantTypeIds
// (src/lib/mother-stock-growth-report.ts): union giữa lô MAU_ME đã lên giàn Phòng mẫu mẹ + lô ACTIVE còn
// ở Phòng tối (chưa lên giàn) của đúng cơ sở đó.
async function getActivePlantTypeIds(warehouseId: string): Promise<string[]> {
  const [shelved, unshelved] = await Promise.all([
    prisma.lot.findMany({
      where: { stage: "MAU_ME", shelf: { warehouseId, room: { type: "PHONG_MAU_ME" } } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
    prisma.lot.findMany({
      where: { stage: "MAU_ME", status: "ACTIVE", room: { warehouseId, type: "PHONG_TOI" } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
  ]);
  return Array.from(new Set([...shelved, ...unshelved].map((r) => r.plantTypeId)));
}

// NV cấy mô đang làm việc tại đúng cơ sở đó — danh sách gợi ý cho NV Kỹ thuật chọn khi gán (không ràng
// buộc cứng ở DB, chỉ gợi ý ở UI — xem comment RootingForecastEntry.assignedStaffId).
export async function getAvailableStaff(warehouseId: string): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export type ForecastEntryRow = { entryId: string; assignedStaffId: string; staffCode: string; staffName: string; quantity: number };
export type ForecastPlantTypeRow = { plantTypeId: string; code: string; name: string; entries: ForecastEntryRow[]; totalQuantity: number };
export type ForecastStatus = {
  taskMonth: Date;
  deadline: Date;
  plantTypes: ForecastPlantTypeRow[];
  availableStaff: { id: string; code: string; name: string }[];
  isComplete: boolean;
  completedAt: Date | null;
  isOnTime: boolean | null; // null = chưa hoàn thành, chưa có gì để đánh giá đúng/trễ hạn
};

export async function getForecastStatus(warehouseId: string, taskMonth: Date): Promise<ForecastStatus> {
  const [plantTypeIds, entries, availableStaff] = await Promise.all([
    getActivePlantTypeIds(warehouseId),
    prisma.rootingForecastEntry.findMany({
      where: { warehouseId, taskMonth },
      select: {
        id: true, plantTypeId: true, quantity: true, enteredAt: true, assignedStaffId: true,
        assignedStaff: { select: { code: true, name: true } },
      },
      orderBy: { assignedStaff: { code: "asc" } },
    }),
    getAvailableStaff(warehouseId),
  ]);

  const plantTypes =
    plantTypeIds.length > 0
      ? await prisma.plantType.findMany({
          where: { id: { in: plantTypeIds } },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        })
      : [];

  const entriesByPlantType = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByPlantType.get(e.plantTypeId) ?? [];
    list.push(e);
    entriesByPlantType.set(e.plantTypeId, list);
  }

  const rows: ForecastPlantTypeRow[] = plantTypes.map((pt) => {
    const ptEntries = entriesByPlantType.get(pt.id) ?? [];
    return {
      plantTypeId: pt.id,
      code: pt.code,
      name: pt.name,
      entries: ptEntries.map((e) => ({
        entryId: e.id,
        assignedStaffId: e.assignedStaffId,
        staffCode: e.assignedStaff.code,
        staffName: e.assignedStaff.name,
        quantity: e.quantity,
      })),
      totalQuantity: ptEntries.reduce((s, e) => s + e.quantity, 0),
    };
  });

  const isComplete = rows.length > 0 && rows.every((r) => r.entries.length > 0);
  const completedAt = isComplete ? new Date(Math.max(...entries.map((e) => e.enteredAt.getTime()))) : null;
  const deadline = getForecastDeadline(taskMonth);
  const isOnTime = completedAt ? completedAt.getTime() <= deadline.getTime() : null;

  return { taskMonth, deadline, plantTypes: rows, availableStaff, isComplete, completedAt, isOnTime };
}

// Gọi lazy từ layout (giống mọi ensureXxx khác, xem src/app/(dashboard)/layout.tsx) — CHỈ gửi nhắc từ
// đúng ngày hạn (15, hoặc 16 nếu 15 là Chủ nhật) trở đi, và chỉ khi chưa hoàn thành. 1 nhắc/tháng/cơ sở
// (dedup qua Alert.relatedId), không nhắc lại mỗi ngày — đúng quy ước "1 nhắc/kỳ" đã dùng ở
// ensureWeeklyDeXuatTask/ensureCustomerStatusReminders. Việc "hiện nhiệm vụ mỗi ngày cho tới khi xong"
// được đáp ứng bằng việc trang /rooting-forecast luôn hiển thị đúng trạng thái còn thiếu mỗi lần NV vào
// xem, không cần bắn thêm alert.
export async function ensureRootingForecastReminder(warehouseId: string | null): Promise<void> {
  if (!warehouseId) return;
  const taskMonth = getTaskMonth();
  const deadline = getForecastDeadline(taskMonth);
  if (new Date() < deadline) return;

  const status = await getForecastStatus(warehouseId, taskMonth);
  if (status.isComplete) return;

  const relatedId = `rooting-forecast:${warehouseId}:${format(taskMonth, "yyyy-MM-dd")}`;
  const alreadySent = await prisma.alert.findFirst({ where: { type: "ROOTING_FORECAST_MONTHLY_DUE", relatedId } });
  if (alreadySent) return;

  const staff = await prisma.user.findMany({
    where: { role: "KY_THUAT", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true },
  });
  for (const s of staff) {
    await createAlert({
      type: "ROOTING_FORECAST_MONTHLY_DUE",
      title: "Nhắc hạn: Dự kiến đáp ứng cây ra rễ",
      message: `Cần điền xong số cây ra rễ dự kiến đáp ứng tháng tới cho mọi mã cây trước ${format(deadline, "dd/MM/yyyy")}.`,
      userId: s.id,
      relatedId,
      relatedType: "RootingForecastEntry",
    });
  }
}
