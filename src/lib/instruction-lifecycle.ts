import { prisma } from "@/lib/prisma";
import { startOfWeek } from "date-fns";
import { detachInstructionFromMediumOrder } from "@/lib/instruction-medium-order";

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

// Chỉ định cấy DỰ PHÒNG (isBackup, xem /instructions/backup) tạo cho ĐÚNG 1 tuần cụ thể (tuần sau lúc
// tạo) — nếu Kho mô không bàn giao (handedOverAt còn null) trước khi hết tuần đó (hết Chủ nhật) thì coi
// như không còn giá trị dùng nữa (đã qua tuần dự phòng cho, không thể "để dành" sang tuần khác) — XOÁ HẲN
// khỏi danh sách (khác cancelInstruction chỉ đổi status, vẫn còn hiện trong list) — quét cùng checkpoint
// với ensureInstructionsEnded (mỗi lần layout dashboard render). Chưa từng bàn giao nên mẫu mẹ nguồn vẫn
// ACTIVE (chưa bị trừ, xem markSourceLotsPlanted) — không cần hoàn trạng thái lô, chỉ cần gỡ khỏi đơn đặt
// hàng môi trường (nếu có, và đơn đó CHƯA được NV môi trường xác nhận) trước khi xoá để không để lại nhu
// cầu môi trường ảo cho 1 chỉ định không còn tồn tại.
export async function ensureBackupInstructionsCleaned(): Promise<void> {
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const staleBackups = await prisma.plantingInstruction.findMany({
    where: { isBackup: true, handedOverAt: null, weekStart: { lt: currentWeekStart } },
    select: { id: true, mediumOrderId: true },
  });
  if (staleBackups.length === 0) return;

  for (const inst of staleBackups) {
    let mediumOrderLocked = false;
    if (inst.mediumOrderId) {
      const order = await prisma.mediumOrder.findUnique({ where: { id: inst.mediumOrderId }, select: { confirmedAt: true } });
      mediumOrderLocked = !!order?.confirmedAt;
    }
    await prisma.$transaction(async (tx) => {
      if (inst.mediumOrderId && !mediumOrderLocked) {
        await detachInstructionFromMediumOrder(tx, inst.id, inst.mediumOrderId);
      }
      await tx.plantingInstructionItem.deleteMany({ where: { instructionId: inst.id } });
      await tx.plantingInstruction.delete({ where: { id: inst.id } });
    });
  }
}
