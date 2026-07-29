import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { addWeeks, startOfWeek, addDays, format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldPlus } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, MIN_BACKUP_INSTRUCTION_COUNT } from "@/types";
import { toStoredWeekStart } from "@/lib/week-rotation";
import BackupInstructionSlots from "./backup-instruction-slots";

export default async function BackupInstructionsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions/backup"))) redirect("/dashboard");
  if (!(isAdminRole(role) || role === "KY_THUAT")) redirect("/instructions");

  // toStoredWeekStart để so khớp CHÍNH XÁC với Date đã lưu (UTC-midnight, xem POST /api/instructions) —
  // không dùng thẳng startOfWeek theo giờ local server, sẽ không khớp giờ lưu thật trong DB.
  const nextWeekStart = toStoredWeekStart(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }));
  const thursdayDeadline = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 3);

  const instructions = await prisma.plantingInstruction.findMany({
    where: { createdById: session!.user.id, isBackup: true, weekStart: nextWeekStart },
    select: {
      id: true,
      code: true,
      plantType: { select: { code: true, name: true } },
      assignedTo: { select: { name: true } },
      items: { select: { quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldPlus className="w-6 h-6 text-primary-strong" /> Chỉ định cấy dự phòng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tạo tối thiểu {MIN_BACKUP_INSTRUCTION_COUNT} chỉ định cấy dự phòng cho tuần{" "}
          {format(nextWeekStart, "dd/MM", { locale: vi })} – {format(addDays(nextWeekStart, 6), "dd/MM/yyyy", { locale: vi })}, trước Thứ 5
          tuần này ({format(thursdayDeadline, "dd/MM/yyyy", { locale: vi })}) — dùng khi NV cấy mô đăng ký làm thêm hoặc hoàn thành sớm chỉ
          định đang thực hiện. Nguồn luôn lấy từ giàn kệ mẫu mẹ chung chưa chia, chưa gắn NV cụ thể — Kho mô sẽ gắn đúng NV đã đăng ký lúc
          bàn giao.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <BackupInstructionSlots instructions={instructions} minCount={MIN_BACKUP_INSTRUCTION_COUNT} />
        </CardContent>
      </Card>
    </div>
  );
}
