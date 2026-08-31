import { format, startOfMonth, getDay, addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import type { Prisma } from "@prisma/client";

// Nhiệm vụ tháng "Dự kiến đáp ứng cây ra rễ" cho NV Kỹ thuật — mỗi cơ sở sản xuất (Warehouse SAN_XUAT,
// gán qua User.workplaceWarehouseId) có 1 vòng nhập liệu/tháng, NV TỰ NHẬP (không có danh sách mã cây cố
// định điền sẵn) từng dòng (mã cây, NV cấy mô, số lượng dự kiến đáp ứng THÁNG KẾ TIẾP) — 1 mã cây có thể
// gắn nhiều NV cấy mô, 1 NV cấy mô có thể gắn nhiều mã cây. NỘP 1 LẦN DUY NHẤT (POST
// /api/rooting-forecast/submit) — sau khi nộp (RootingForecastSubmission tồn tại) thì KHOÁ CỨNG, chỉ còn
// sửa được qua RootingForecastEditProposal (Admin duyệt mới thực sự cập nhật). Hạn hoàn thành ngày 15 của
// taskMonth (dời sang 16 nếu 15 là Chủ nhật). Không có bảng "Task" riêng — mọi thứ tính LIVE từ
// RootingForecastEntry/RootingForecastSubmission (xem prisma/schema.prisma).

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

// Upsert dùng chung cho cả bước nộp lần đầu (POST /api/rooting-forecast/submit) lẫn bước Admin duyệt đề
// xuất chỉnh sửa (PATCH /api/rooting-forecast-edit-proposals/[id]) — tránh lặp lại logic 2 nơi. `tx` cho
// phép gọi trong 1 $transaction lớn hơn (bắt buộc với submit — tạo nhiều dòng + khoá phải atomic).
export async function applyForecastEntry(
  tx: Prisma.TransactionClient,
  params: { warehouseId: string; plantTypeId: string; taskMonth: Date; assignedStaffId: string; quantity: number; enteredById: string }
) {
  const { warehouseId, plantTypeId, taskMonth, assignedStaffId, quantity, enteredById } = params;
  await tx.rootingForecastEntry.upsert({
    where: { warehouseId_plantTypeId_taskMonth_assignedStaffId: { warehouseId, plantTypeId, taskMonth, assignedStaffId } },
    create: { warehouseId, plantTypeId, taskMonth, assignedStaffId, quantity, enteredById },
    update: { quantity, enteredById, enteredAt: new Date() },
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
  isLocked: boolean; // đã nộp — không sửa/xoá trực tiếp được nữa
  isComplete: boolean; // = isLocked, giữ tên này cho phần nhắc hạn (ensureRootingForecastReminder)
  completedAt: Date | null; // = submittedAt nếu đã khoá
  isOnTime: boolean | null; // null = chưa nộp, chưa có gì để đánh giá đúng/trễ hạn
};

export async function getForecastStatus(warehouseId: string, taskMonth: Date): Promise<ForecastStatus> {
  const [entries, availableStaff, submission] = await Promise.all([
    prisma.rootingForecastEntry.findMany({
      where: { warehouseId, taskMonth },
      select: {
        id: true, plantTypeId: true, quantity: true, assignedStaffId: true,
        plantType: { select: { code: true, name: true } },
        assignedStaff: { select: { code: true, name: true } },
      },
      orderBy: { plantType: { code: "asc" } },
    }),
    getAvailableStaff(warehouseId),
    prisma.rootingForecastSubmission.findUnique({ where: { warehouseId_taskMonth: { warehouseId, taskMonth } } }),
  ]);

  const rows: ForecastEntryRow[] = entries.map((e) => ({
    entryId: e.id,
    plantTypeId: e.plantTypeId, plantTypeCode: e.plantType.code, plantTypeName: e.plantType.name,
    assignedStaffId: e.assignedStaffId, staffCode: e.assignedStaff.code, staffName: e.assignedStaff.name,
    quantity: e.quantity,
  }));

  const isLocked = !!submission;
  const completedAt = submission?.submittedAt ?? null;
  const deadline = getForecastDeadline(taskMonth);
  const isOnTime = completedAt ? completedAt.getTime() <= deadline.getTime() : null;

  return { taskMonth, deadline, entries: rows, availableStaff, isLocked, isComplete: isLocked, completedAt, isOnTime };
}

// Gọi lazy từ layout (giống mọi ensureXxx khác, xem src/app/(dashboard)/layout.tsx) — CHỈ gửi nhắc từ
// đúng ngày hạn (15, hoặc 16 nếu 15 là Chủ nhật) trở đi, và chỉ khi chưa nộp. 1 nhắc/tháng/cơ sở (dedup
// qua Alert.relatedId), không nhắc lại mỗi ngày — đúng quy ước "1 nhắc/kỳ" đã dùng ở
// ensureWeeklyDeXuatTask/ensureCustomerStatusReminders.
export async function ensureRootingForecastReminder(warehouseId: string | null): Promise<void> {
  if (!warehouseId) return;
  const taskMonth = getTaskMonth();
  const deadline = getForecastDeadline(taskMonth);
  if (new Date() < deadline) return;

  const status = await getForecastStatus(warehouseId, taskMonth);
  if (status.isLocked) return;

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
      message: `Cần nộp số cây ra rễ dự kiến đáp ứng tháng tới trước ${format(deadline, "dd/MM/yyyy")}.`,
      userId: s.id,
      relatedId,
      relatedType: "RootingForecastEntry",
    });
  }
}
