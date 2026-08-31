import { format, startOfMonth, getDay, addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";

// Nhiệm vụ tháng "Dự kiến đáp ứng cây ra rễ" cho NV Kỹ thuật — mỗi cơ sở sản xuất (Warehouse SAN_XUAT,
// gán qua User.workplaceWarehouseId) có 1 vòng nhập liệu/tháng, NV TỰ NHẬP (không có danh sách mã cây cố
// định điền sẵn) từng dòng (mã cây, NV cấy mô, số lượng dự kiến đáp ứng THÁNG KẾ TIẾP) — 1 mã cây có thể
// gắn nhiều NV cấy mô, 1 NV cấy mô có thể gắn nhiều mã cây (không giới hạn tổ hợp, chỉ duy nhất theo đúng
// từng cặp mã cây + NV, xem @@unique). Hạn hoàn thành ngày 15 của taskMonth (dời sang 16 nếu 15 là Chủ
// nhật). Không có bảng "Task" riêng lưu trạng thái — mọi thứ tính LIVE từ RootingForecastEntry (xem
// prisma/schema.prisma): hoàn thành ngay khi đã lưu ÍT NHẤT 1 dòng hợp lệ trong tháng.

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

// NV cấy mô đang làm việc tại đúng cơ sở đó — danh sách gợi ý cho NV Kỹ thuật chọn khi gán (không ràng
// buộc cứng ở DB, chỉ gợi ý ở UI — xem comment RootingForecastEntry.assignedStaffId).
export async function getAvailableStaff(warehouseId: string): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export type ForecastEntryRow = {
  entryId: string;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  assignedStaffId: string; staffCode: string; staffName: string;
  quantity: number;
};
export type ForecastStatus = {
  taskMonth: Date;
  deadline: Date;
  entries: ForecastEntryRow[];
  availableStaff: { id: string; code: string; name: string }[];
  isComplete: boolean;
  completedAt: Date | null;
  isOnTime: boolean | null; // null = chưa hoàn thành, chưa có gì để đánh giá đúng/trễ hạn
};

export async function getForecastStatus(warehouseId: string, taskMonth: Date): Promise<ForecastStatus> {
  const [entries, availableStaff] = await Promise.all([
    prisma.rootingForecastEntry.findMany({
      where: { warehouseId, taskMonth },
      select: {
        id: true, plantTypeId: true, quantity: true, enteredAt: true, assignedStaffId: true,
        plantType: { select: { code: true, name: true } },
        assignedStaff: { select: { code: true, name: true } },
      },
      orderBy: { enteredAt: "asc" },
    }),
    getAvailableStaff(warehouseId),
  ]);

  const rows: ForecastEntryRow[] = entries.map((e) => ({
    entryId: e.id,
    plantTypeId: e.plantTypeId, plantTypeCode: e.plantType.code, plantTypeName: e.plantType.name,
    assignedStaffId: e.assignedStaffId, staffCode: e.assignedStaff.code, staffName: e.assignedStaff.name,
    quantity: e.quantity,
  }));

  // "Hoàn thành" = đã lưu ít nhất 1 dòng hợp lệ trong tháng — không còn danh sách mã cây cố định cần điền
  // đủ (NV tự nhập tự do). completedAt lấy dòng SỚM NHẤT hiện còn (entries đã orderBy enteredAt asc) —
  // đúng thời điểm ngưỡng "có ít nhất 1 dòng" được thoả lần đầu (nếu sau đó xoá hết rồi nhập lại thì tính
  // lại từ dòng mới, chấp nhận sai số nhỏ này, giống các chỗ khác trong dự án không lưu lịch sử đầy đủ).
  const isComplete = rows.length > 0;
  const completedAt = isComplete ? entries[0].enteredAt : null;
  const deadline = getForecastDeadline(taskMonth);
  const isOnTime = completedAt ? completedAt.getTime() <= deadline.getTime() : null;

  return { taskMonth, deadline, entries: rows, availableStaff, isComplete, completedAt, isOnTime };
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
      message: `Cần nhập số cây ra rễ dự kiến đáp ứng tháng tới trước ${format(deadline, "dd/MM/yyyy")}.`,
      userId: s.id,
      relatedId,
      relatedType: "RootingForecastEntry",
    });
  }
}
