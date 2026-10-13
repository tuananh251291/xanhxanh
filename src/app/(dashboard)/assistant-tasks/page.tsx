import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { canUseAssistantTasks } from "@/lib/assistant-task";
import { ROLE_LABELS } from "@/types";
import AssistantTaskBoard from "./assistant-task-board";

// Theo dõi công việc — NV Trợ lý ghi lại việc Giám đốc giao và theo dõi hạn (dựng theo bảng "Bảng điều
// khiển công việc của Giám đốc"). Chỉ NV Trợ lý + Admin cấp cao (chặn cả Admin thường dù isPageAllowed cho qua).
export default async function AssistantTasksPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/assistant-tasks"))) redirect("/dashboard");
  if (!canUseAssistantTasks(role)) redirect("/dashboard");

  const staff = await prisma.user.findMany({
    where: { isActive: true, status: "APPROVED", role: { not: null } },
    select: { id: true, name: true, code: true, role: true },
    orderBy: { name: "asc" },
  });
  const staffOptions = staff.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.code}${u.role ? ` · ${ROLE_LABELS[u.role]}` : ""})`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-primary-strong" /> Theo dõi công việc
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Công việc cố định &amp; phát sinh — tự tính thời gian còn lại / số ngày trễ
        </p>
      </div>
      <AssistantTaskBoard staffOptions={staffOptions} />
    </div>
  );
}
