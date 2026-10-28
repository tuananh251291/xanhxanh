import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { AssistantTaskRepeat } from "@prisma/client";

// "Lặp lại" của Theo dõi công việc (NV Trợ lý, /assistant-tasks): dòng mới nhất của mỗi chuỗi lặp (repeat
// khác NONE, repeatSpawnedAt null) tới ngày bàn giao của kỳ kế tiếp thì tự tạo 1 công việc mới giống hệt
// (phân loại, nội dung, người chịu trách nhiệm, cài đặt lặp), trạng thái Chưa làm, ngày bàn giao + deadline
// dời sang kỳ đó (deadline giữ nguyên khoảng cách so với ngày bàn giao). Dòng kỳ trước giữ nguyên trạng
// thái/lịch sử, chỉ đánh dấu repeatSpawnedAt. Tính lazy mỗi lần tải danh sách (GET /api/assistant-tasks),
// bù đủ các kỳ đã lỡ nếu lâu không ai mở trang.
//
// Ngày lưu UTC-midnight (xem AssistantTask, schema.prisma) — mọi phép tính làm trên khoá "yyyy-MM-dd" theo
// UTC để không lệch múi giờ.

const toKey = (d: Date) => d.toISOString().slice(0, 10);
const fromKey = (k: string) => new Date(`${k}T00:00:00.000Z`);
const addDaysKey = (k: string, n: number) => toKey(new Date(fromKey(k).getTime() + n * 86400000));
const diffDays = (a: string, b: string) => Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86400000);
// 1 = Thứ 2 … 7 = Chủ nhật.
export const isoWeekdayOfKey = (k: string) => ((fromKey(k).getUTCDay() + 6) % 7) + 1;

// Cộng tháng giữ đúng ngày của mốc gốc, tháng ngắn hơn thì lấy ngày cuối tháng (31/01 → 28/02 → 31/03).
function anchorPlusMonths(anchorKey: string, months: number): string {
  const a = fromKey(anchorKey);
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toKey(new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), lastDay))));
}

export function nextRepeatDate(
  repeat: AssistantTaskRepeat,
  currentKey: string,
  weekdays: number[],
  anchorKey: string | null
): string | null {
  const anchor = anchorKey ?? currentKey;
  switch (repeat) {
    case "DAILY":
      return addDaysKey(currentKey, 1);
    case "WEEKLY": {
      const days = weekdays.length > 0 ? weekdays : [isoWeekdayOfKey(anchor)];
      for (let i = 1; i <= 7; i++) {
        const k = addDaysKey(currentKey, i);
        if (days.includes(isoWeekdayOfKey(k))) return k;
      }
      return null;
    }
    case "MONTHLY":
    case "YEARLY": {
      const step = repeat === "MONTHLY" ? 1 : 12;
      const a = fromKey(anchor);
      const c = fromKey(currentKey);
      let n = (c.getUTCFullYear() - a.getUTCFullYear()) * 12 + (c.getUTCMonth() - a.getUTCMonth());
      n = Math.max(0, Math.floor(n / step) * step);
      for (let i = 0; i < 4; i++) {
        n += step;
        const k = anchorPlusMonths(anchor, n);
        if (k > currentKey) return k;
      }
      return null;
    }
    default:
      return null;
  }
}

// Giới hạn số kỳ bù 1 lần cho 1 chuỗi (VD lặp hằng ngày bị bỏ quên lâu) — phần còn lại bù ở lần tải sau.
const MAX_SPAWN_PER_CHAIN = 400;

export async function ensureAssistantTaskRepeats(now: Date = new Date()): Promise<number> {
  const todayKey = format(now, "yyyy-MM-dd");
  const heads = await prisma.assistantTask.findMany({
    where: { repeat: { not: "NONE" }, repeatSpawnedAt: null },
  });
  let created = 0;
  for (const head of heads) {
    let current = head;
    for (let i = 0; i < MAX_SPAWN_PER_CHAIN; i++) {
      const currentKey = toKey(current.assignedDate);
      const anchorKey = current.repeatAnchorDate ? toKey(current.repeatAnchorDate) : null;
      const nextKey = nextRepeatDate(current.repeat, currentKey, current.repeatWeekdays, anchorKey);
      if (!nextKey || nextKey > todayKey) break;
      const deadlineKey = addDaysKey(nextKey, Math.max(0, diffDays(toKey(current.deadline), currentKey)));
      const source = current;
      const next = await prisma.$transaction(async (tx) => {
        // Khoá dòng nguồn — 2 lần tải trang cùng lúc không sinh trùng kỳ.
        const locked = await tx.assistantTask.updateMany({
          where: { id: source.id, repeatSpawnedAt: null },
          data: { repeatSpawnedAt: new Date() },
        });
        if (locked.count === 0) return null;
        return tx.assistantTask.create({
          data: {
            category: source.category,
            title: source.title,
            responsibleId: source.responsibleId,
            assignedDate: fromKey(nextKey),
            deadline: fromKey(deadlineKey),
            status: "CHUA_LAM",
            repeat: source.repeat,
            repeatWeekdays: source.repeatWeekdays,
            repeatAnchorDate: source.repeatAnchorDate ?? source.assignedDate,
            repeatSourceId: source.id,
            createdById: source.createdById,
          },
        });
      });
      if (!next) break;
      created += 1;
      current = next;
    }
  }
  return created;
}
