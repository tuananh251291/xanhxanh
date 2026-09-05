import { format, addMonths, getDay, addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import type { Prisma } from "@prisma/client";

// Nhiệm vụ "Dự kiến đáp ứng cây ra rễ" cho NV Kỹ thuật — mỗi cơ sở sản xuất (Warehouse SAN_XUAT, gán qua
// User.workplaceWarehouseId) có 1 vòng nhập liệu mỗi 3 THÁNG (trước đây là mỗi tháng), NV TỰ NHẬP (không
// có danh sách mã cây cố định điền sẵn) từng dòng (mã cây, NV cấy mô, quantity1/2/3 = số lượng dự kiến
// đáp ứng cho LẦN LƯỢT 3 THÁNG KẾ TIẾP taskMonth) — 1 mã cây có thể gắn nhiều NV cấy mô, 1 NV cấy mô có
// thể gắn nhiều mã cây. NỘP 1 LẦN DUY NHẤT cho cả lộ trình 3 tháng (POST /api/rooting-forecast/submit) —
// sau khi nộp (RootingForecastSubmission tồn tại) thì KHOÁ CỨNG, chỉ còn sửa được qua
// RootingForecastEditProposal (Admin duyệt mới thực sự cập nhật).
//
// Chu kỳ taskMonth cách nhau ĐÚNG 3 THÁNG, tính từ ROOTING_FORECAST_CYCLE_EPOCH — nhiệm vụ của 1 chu kỳ
// MỞ (NV bắt đầu thấy/nộp được) từ ngày 5 của taskMonth ("tháng cuối cùng trong lộ trình 3 tháng vừa nộp
// trước đó" — VD lộ trình trước dự kiến cho tháng 10/11/12 thì taskMonth mới = tháng 12, mở ngày 5/12,
// lộ trình mới dự kiến cho tháng 1/2/3 năm sau). Hạn hoàn thành vẫn ngày 15 của taskMonth (dời sang 16
// nếu 15 là Chủ nhật) — KHÔNG đổi so với trước. Không có bảng "Task" riêng — mọi thứ tính LIVE từ
// RootingForecastEntry/RootingForecastSubmission (xem prisma/schema.prisma).

// Mốc chuyển từ chu kỳ HÀNG THÁNG (cũ) sang chu kỳ 3 THÁNG (mới) — tháng 9/2026 là taskMonth cuối cùng
// dưới hệ cũ (đã nộp, chỉ có quantity1 = dự báo tháng 10, quantity2/3 chưa hề được hỏi tới nên giữ 0 khi
// migrate dữ liệu cũ — xem script migrate lúc đổi schema). Chu kỳ 3 tháng ĐẦU TIÊN dưới hệ mới bắt đầu
// từ taskMonth 12/2026 (9/2026 + 3), mở ngày 5/12/2026, dự kiến cho tháng 1/2/3/2027.
const ROOTING_FORECAST_CYCLE_EPOCH = new Date(2026, 8, 1);

// yyyy-MM-01 UTC-midnight của taskMonth (chu kỳ 3 tháng) ĐANG hiệu lực tại thời điểm `date` — đi từng
// bước 3 tháng kể từ epoch, chỉ nhảy sang chu kỳ kế tiếp khi `date` đã qua ngày 5 của chu kỳ đó (xem
// getForecastOpensAt) — trước ngày 5, taskMonth vẫn là chu kỳ trước (đã khoá/đã qua hạn, không có gì mới
// để nộp cho tới khi chu kỳ kế tiếp mở).
export function getTaskMonth(date: Date = new Date()): Date {
  let candidate = new Date(format(ROOTING_FORECAST_CYCLE_EPOCH, "yyyy-MM-dd"));
  while (true) {
    const next = addMonths(candidate, 3);
    if (date.getTime() < getForecastOpensAt(next).getTime()) break;
    candidate = next;
  }
  return candidate;
}

// Ngày MỞ nhiệm vụ của 1 taskMonth — ngày 5 của chính taskMonth đó (không dời nếu rơi cuối tuần, chỉ hạn
// nộp (15) mới có quy tắc dời).
export function getForecastOpensAt(taskMonth: Date): Date {
  return new Date(taskMonth.getFullYear(), taskMonth.getMonth(), 5);
}

// Hạn hoàn thành — ngày 15 của taskMonth, dời sang 16 nếu 15 rơi Chủ nhật (getDay === 0).
export function getForecastDeadline(taskMonth: Date): Date {
  const day15 = new Date(taskMonth.getFullYear(), taskMonth.getMonth(), 15);
  return getDay(day15) === 0 ? addDays(day15, 1) : day15;
}

// 3 tháng mục tiêu của 1 taskMonth — quantity1/2/3 tương ứng lần lượt.
export function getForecastTargetMonths(taskMonth: Date): [Date, Date, Date] {
  return [addMonths(taskMonth, 1), addMonths(taskMonth, 2), addMonths(taskMonth, 3)];
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
  params: {
    warehouseId: string; plantTypeId: string; taskMonth: Date; assignedStaffId: string;
    quantity1: number; quantity2: number; quantity3: number; enteredById: string;
  }
) {
  const { warehouseId, plantTypeId, taskMonth, assignedStaffId, quantity1, quantity2, quantity3, enteredById } = params;
  await tx.rootingForecastEntry.upsert({
    where: { warehouseId_plantTypeId_taskMonth_assignedStaffId: { warehouseId, plantTypeId, taskMonth, assignedStaffId } },
    create: { warehouseId, plantTypeId, taskMonth, assignedStaffId, quantity1, quantity2, quantity3, enteredById },
    update: { quantity1, quantity2, quantity3, enteredById, enteredAt: new Date() },
  });
}

export type ForecastEntryRow = {
  entryId: string;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  assignedStaffId: string; staffCode: string; staffName: string;
  quantity1: number; quantity2: number; quantity3: number;
};
export type ForecastStatus = {
  taskMonth: Date;
  targetMonths: [Date, Date, Date];
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
        id: true, plantTypeId: true, quantity1: true, quantity2: true, quantity3: true, assignedStaffId: true,
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
    quantity1: e.quantity1, quantity2: e.quantity2, quantity3: e.quantity3,
  }));

  const isLocked = !!submission;
  const completedAt = submission?.submittedAt ?? null;
  const deadline = getForecastDeadline(taskMonth);
  const isOnTime = completedAt ? completedAt.getTime() <= deadline.getTime() : null;

  return {
    taskMonth, targetMonths: getForecastTargetMonths(taskMonth), deadline,
    entries: rows, availableStaff, isLocked, isComplete: isLocked, completedAt, isOnTime,
  };
}

// Gọi lazy từ layout (giống mọi ensureXxx khác, xem src/app/(dashboard)/layout.tsx) — gửi thông báo nhiệm
// vụ TỪ ĐÚNG NGÀY MỞ (mùng 5 của taskMonth — tháng cuối cùng trong lộ trình 3 tháng vừa nộp trước đó), và
// chỉ khi chưa nộp. 1 thông báo/chu kỳ 3 tháng/cơ sở (dedup qua Alert.relatedId), không gửi lại mỗi ngày —
// đúng quy ước "1 nhắc/kỳ" đã dùng ở ensureWeeklyDeXuatTask/ensureCustomerStatusReminders. Cùng 1 thông
// báo này đóng vai trò vừa là "nhiệm vụ đã mở" (gửi ngay ngày 5) vừa là nhắc hạn còn lại tới ngày 15 —
// không tách riêng 2 loại thông báo vì dedup theo relatedId chỉ cho gửi ĐÚNG 1 lần/chu kỳ.
export async function ensureRootingForecastReminder(warehouseId: string | null): Promise<void> {
  if (!warehouseId) return;
  const taskMonth = getTaskMonth();
  if (new Date() < getForecastOpensAt(taskMonth)) return;

  const status = await getForecastStatus(warehouseId, taskMonth);
  if (status.isLocked) return;

  const relatedId = `rooting-forecast:${warehouseId}:${format(taskMonth, "yyyy-MM-dd")}`;
  const alreadySent = await prisma.alert.findFirst({ where: { type: "ROOTING_FORECAST_MONTHLY_DUE", relatedId } });
  if (alreadySent) return;

  const [m1, m2, m3] = status.targetMonths;
  const monthsLabel = [m1, m2, m3].map((m) => format(m, "MM/yyyy")).join(", ");

  const staff = await prisma.user.findMany({
    where: { role: "KY_THUAT", workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true },
  });
  for (const s of staff) {
    await createAlert({
      type: "ROOTING_FORECAST_MONTHLY_DUE",
      title: "Nhiệm vụ mới: Dự kiến đáp ứng cây ra rễ",
      message: `Cần nộp số cây ra rễ dự kiến đáp ứng cho 3 tháng tới (${monthsLabel}) trước ${format(status.deadline, "dd/MM/yyyy")}.`,
      userId: s.id,
      relatedId,
      relatedType: "RootingForecastEntry",
    });
  }
}
