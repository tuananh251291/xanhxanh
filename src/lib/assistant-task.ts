import { differenceInCalendarDays, format } from "date-fns";

// Theo dõi công việc (NV Trợ lý, /assistant-tasks) — phần tính toán dùng chung cho trang lẫn API, không
// import Prisma để dùng được ở client.

export const ASSISTANT_TASK_CATEGORY_LABELS = { CO_DINH: "Cố định", PHAT_SINH: "Phát sinh" } as const;
export const ASSISTANT_TASK_STATUS_LABELS = { CHUA_LAM: "Chưa làm", DANG_XU_LY: "Đang xử lý", HOAN_THANH: "Hoàn thành" } as const;

export type AssistantTaskCategory = keyof typeof ASSISTANT_TASK_CATEGORY_LABELS;
export type AssistantTaskStatus = keyof typeof ASSISTANT_TASK_STATUS_LABELS;

// Còn ít hơn số ngày này (và chưa trễ) = "Sắp đến hạn" — đúng quy ước "<3 ngày" của bảng gốc (còn 0, 1, 2 ngày).
export const ASSISTANT_TASK_DUE_SOON_DAYS = 3;

// Nhóm màu theo QUY ƯỚC PHÂN LOẠI của bảng gốc: Đang xử lý / Sắp đến hạn (<3 ngày) / Trễ hẹn / Hoàn thành.
export type AssistantTaskTone = "done" | "overdue" | "due-soon" | "in-progress";

// Ngày lưu dạng UTC-midnight (xem AssistantTask, schema.prisma) → "yyyy-MM-dd" → Date local cùng ngày, để
// differenceInCalendarDays so đúng theo lịch Việt Nam.
export function taskDateKey(d: Date | string): string {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}
function localDay(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export function describeAssistantTask(
  task: { deadline: Date | string; status: AssistantTaskStatus; completedAt: Date | string | null },
  now: Date = new Date()
): { tone: AssistantTaskTone; remainingLabel: string; reminderLabel: string; daysLeft: number } {
  const deadline = localDay(taskDateKey(task.deadline));
  if (task.status === "HOAN_THANH") {
    const doneDay = task.completedAt ? localDay(format(new Date(task.completedAt), "yyyy-MM-dd")) : null;
    const late = doneDay ? differenceInCalendarDays(doneDay, deadline) : 0;
    return {
      tone: "done",
      remainingLabel: late > 0 ? `Hoàn thành trễ ${late} ngày` : "Đã hoàn thành",
      reminderLabel: "Không cần nhắc",
      daysLeft: 0,
    };
  }
  const daysLeft = differenceInCalendarDays(deadline, localDay(format(now, "yyyy-MM-dd")));
  if (daysLeft < 0) {
    return { tone: "overdue", remainingLabel: `Trễ ${-daysLeft} ngày`, reminderLabel: "Nhắc gấp", daysLeft };
  }
  const remainingLabel = daysLeft === 0 ? "Hạn hôm nay" : `Còn ${daysLeft} ngày`;
  if (daysLeft < ASSISTANT_TASK_DUE_SOON_DAYS) return { tone: "due-soon", remainingLabel, reminderLabel: "Cần nhắc", daysLeft };
  return { tone: "in-progress", remainingLabel, reminderLabel: "Theo dõi", daysLeft };
}

export const ASSISTANT_TASK_TONE_LABELS: Record<AssistantTaskTone, string> = {
  "in-progress": "Đang xử lý",
  "due-soon": "Sắp đến hạn (<3 ngày)",
  overdue: "Trễ hẹn",
  done: "Hoàn thành",
};

// Class nền dòng/badge theo từng nhóm — token pastel của design system (CLAUDE.md).
export const ASSISTANT_TASK_TONE_CLASSES: Record<AssistantTaskTone, string> = {
  "in-progress": "bg-info-light text-info-foreground",
  "due-soon": "bg-warning-light text-warning-foreground",
  overdue: "bg-danger-light text-destructive",
  done: "bg-primary-light text-primary-strong",
};

// Ai được dùng trang Theo dõi công việc: NV Trợ lý + Admin cấp cao (Giám đốc).
export function canUseAssistantTasks(role: string | null | undefined): boolean {
  return role === "TRO_LY" || role === "SUPER_ADMIN";
}
