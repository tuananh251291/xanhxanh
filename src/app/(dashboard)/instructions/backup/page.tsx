import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { addWeeks, startOfWeek, addDays, format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldPlus } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, MIN_BACKUP_INSTRUCTION_COUNT } from "@/types";
import { toStoredWeekStart } from "@/lib/week-rotation";
import BackupInstructionSlots from "./backup-instruction-slots";

export default async function BackupInstructionsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions/backup"))) redirect("/dashboard");
  if (!(isAdminRole(role) || role === "KY_THUAT")) redirect("/instructions");

  // KY_THUAT chọn xem/tạo chỉ định dự phòng cho tuần này hay tuần sau (?week=current|next, mặc định
  // "next" — giữ đúng hành vi cũ trước khi cho chọn tuần). toStoredWeekStart để so khớp CHÍNH XÁC với
  // Date đã lưu (UTC-midnight, xem POST /api/instructions) — không dùng thẳng startOfWeek theo giờ local
  // server, sẽ không khớp giờ lưu thật trong DB.
  const sp = await searchParams;
  const selectedWeek = sp.week === "current" ? "current" : "next";
  const currentWeekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const nextWeekStart = toStoredWeekStart(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }));
  const weekStart = selectedWeek === "current" ? currentWeekStart : nextWeekStart;
  const thursdayDeadline = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 3);

  const instructions = await prisma.plantingInstruction.findMany({
    where: { createdById: session!.user.id, isBackup: true, weekStart },
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
          Tạo tối thiểu {MIN_BACKUP_INSTRUCTION_COUNT} chỉ định cấy dự phòng cho tuần đang chọn — dùng khi NV cấy mô đăng ký làm thêm hoặc
          hoàn thành sớm chỉ định đang thực hiện. Chỉ tiêu chính vẫn là tuần sau, trước Thứ 5 tuần này (
          {format(thursdayDeadline, "dd/MM/yyyy", { locale: vi })}) — &quot;Tuần này&quot; dùng khi cần bổ sung dự phòng gấp trong tuần. Nguồn
          luôn lấy từ giàn kệ mẫu mẹ chung chưa chia, chưa gắn NV cụ thể — Kho mô sẽ gắn đúng NV đã đăng ký lúc bàn giao.
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/instructions/backup?week=current"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            selectedWeek === "current" ? "bg-primary-light text-primary-strong border-primary" : "border-border text-text-secondary hover:bg-primary-light/30"
          }`}
        >
          Tuần này ({format(currentWeekStart, "dd/MM", { locale: vi })} – {format(addDays(currentWeekStart, 6), "dd/MM/yyyy", { locale: vi })})
        </Link>
        <Link
          href="/instructions/backup?week=next"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
            selectedWeek === "next" ? "bg-primary-light text-primary-strong border-primary" : "border-border text-text-secondary hover:bg-primary-light/30"
          }`}
        >
          Tuần sau ({format(nextWeekStart, "dd/MM", { locale: vi })} – {format(addDays(nextWeekStart, 6), "dd/MM/yyyy", { locale: vi })})
        </Link>
      </div>

      <Card>
        <CardContent className="pt-4">
          <BackupInstructionSlots
            instructions={instructions}
            minCount={MIN_BACKUP_INSTRUCTION_COUNT}
            weekStart={format(weekStart, "yyyy-MM-dd")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
