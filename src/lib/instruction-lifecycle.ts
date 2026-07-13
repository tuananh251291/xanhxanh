import { prisma } from "@/lib/prisma";
import { startOfWeek } from "date-fns";

// Không có tiến trình chạy nền (cron) trong app này — trước đây chỉ định chỉ chuyển ENDED/TIME_UP khi
// NV cấy mô bấm "Lưu dữ liệu hôm nay" ĐÚNG vào Chủ nhật (xem POST /api/daily-records), nên nếu không ai
// lưu đúng ngày đó thì chỉ định kẹt "Đang thực hiện" vĩnh viễn. Hàm này quét mỗi khi layout dashboard
// render (coi như checkpoint gần-thời-gian-thực) và tự kết thúc mọi chỉ định đã qua tuần thực hiện —
// mặc định kết thúc khi hết Chủ nhật của tuần đó, bất kể NV cấy mô có nhập liệu hôm đó hay không.
export async function ensureInstructionsEnded(): Promise<void> {
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  await prisma.plantingInstruction.updateMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT"] },
      weekStart: { lt: currentWeekStart },
    },
    data: { status: "ENDED", endReason: "TIME_UP" },
  });
}
