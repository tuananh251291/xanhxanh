import { prisma } from "@/lib/prisma";
import { endOfWeek } from "date-fns";

// Tự tắt thông báo "NV cấy mô báo sẵn sàng nhận thêm việc" (EXTRA_WORK_REQUEST, tạo ở POST
// /api/extra-work-requests nhánh EARLY_COMPLETION + instructionId null — NV đã hoàn thành hết chỉ định,
// KHÔNG phải nhánh "báo hoàn thành sớm 1 chỉ định cụ thể") khi đã qua HẾT TUẦN chứa expectedEndDate —
// cùng cửa sổ tuần hệ thống đang dùng để coi đăng ký này còn "khả dụng" hay không (xem GET
// /api/extra-work-requests?availableToAssign=true) — qua tuần đó thì lời báo "sẵn sàng nhận thêm việc từ
// ngày X" đã hết ý nghĩa, không cần Kho mô tự bấm "Đã xem" nữa. KHÔNG đụng tới nhánh "báo hoàn thành sớm
// chỉ định" hay OVERTIME (đăng ký làm thêm ngoài giờ) — 2 loại thông báo đó user chưa yêu cầu.
export async function ensureExpiredExtraWorkReadinessAlertsRead(): Promise<void> {
  const now = new Date();
  const candidates = await prisma.extraWorkRequest.findMany({
    where: { type: "EARLY_COMPLETION", instructionId: null, expectedEndDate: { not: null } },
    select: { id: true, expectedEndDate: true },
  });
  const expiredIds = candidates
    .filter((r) => r.expectedEndDate && endOfWeek(r.expectedEndDate, { weekStartsOn: 1 }) < now)
    .map((r) => r.id);
  if (expiredIds.length === 0) return;

  await prisma.alert.updateMany({
    where: { type: "EXTRA_WORK_REQUEST", relatedId: { in: expiredIds }, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
}
