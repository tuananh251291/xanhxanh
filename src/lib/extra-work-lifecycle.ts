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

// Dọn đăng ký làm thêm/hoàn thành sớm CHƯA được xử lý xong (chưa từ chối, chưa thật sự được giao việc —
// fulfilledAt null) một khi đã qua HẾT TUẦN của đăng ký đó — cùng pattern ensureBackupInstructionsCleaned
// (src/lib/instruction-lifecycle.ts): quá hạn tuần thì đăng ký không còn ý nghĩa gì nữa (NV đã qua tuần
// đó rồi), xoá hẳn khỏi danh sách thay vì để tồn đọng mãi. REJECTED giữ nguyên làm lịch sử (NV đã được
// báo qua Alert từ trước); APPROVED đã fulfilledAt (đã giao chỉ định/hàn túi thật) cũng giữ nguyên.
// "Tuần của đăng ký" — EARLY_COMPLETION lấy theo expectedEndDate, OVERTIME lấy theo ngày của slot đầu
// tiên (mọi slot trong 1 đăng ký luôn cùng 1 tuần — chỉ đăng ký được trong tuần hiện tại lúc gửi, xem
// POST /api/extra-work-requests). ExtraWorkSlot tự xoá theo (onDelete: Cascade trên schema).
export async function ensureExpiredExtraWorkRequestsCleaned(): Promise<void> {
  const now = new Date();
  const candidates = await prisma.extraWorkRequest.findMany({
    where: { status: { not: "REJECTED" }, fulfilledAt: null },
    select: { id: true, type: true, expectedEndDate: true, slots: { select: { date: true }, take: 1 } },
  });
  const expiredIds = candidates
    .filter((r) => {
      const relevantDate = r.type === "EARLY_COMPLETION" ? r.expectedEndDate : r.slots[0]?.date;
      return !!relevantDate && endOfWeek(relevantDate, { weekStartsOn: 1 }) < now;
    })
    .map((r) => r.id);
  if (expiredIds.length === 0) return;

  await prisma.extraWorkRequest.deleteMany({ where: { id: { in: expiredIds } } });
}
