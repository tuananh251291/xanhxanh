import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";
import { isPageAllowed } from "@/lib/permissions";
import { MOTHER_SPEC_LABELS } from "@/types";

type Task = {
  instructionCode: string;
  plantTypeName: string;
  assignedToName: string | null;
  status: string;
  stageCode: string | null;
  purpose: "MOTHER" | "FINISHED";
  quantity: number;
};

export default async function MediumTasksPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/medium/tasks"))) redirect("/dashboard");

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  // Mỗi dòng quy cách nguồn (M3/M5) trong 1 chỉ định có thể cần 2 môi trường riêng: 1 để nhân thêm
  // mẫu mẹ (số lượng = quantity đưa vào), 1 để ra rễ thành cây thành phẩm (số lượng = expectedFinishedOutput).
  const items = await prisma.plantingInstructionItem.findMany({
    where: {
      instruction: {
        status: { in: ["DRAFT", "ACTIVE"] },
        OR: [
          { weekStart: { gte: weekStart, lte: weekEnd } },
          { weekStart: null, createdAt: { gte: weekStart, lte: weekEnd } },
        ],
      },
    },
    include: {
      instruction: {
        select: {
          code: true,
          status: true,
          plantType: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      },
      motherMedium: { select: { id: true, code: true, name: true } },
      finishedMedium: { select: { id: true, code: true, name: true } },
    },
  });

  const byMedium = new Map<string, { name: string; code: string; tasks: Task[] }>();
  const addTask = (medium: { id: string; code: string; name: string } | null, task: Task) => {
    if (!medium) return;
    if (!byMedium.has(medium.code)) byMedium.set(medium.code, { name: medium.name, code: medium.code, tasks: [] });
    byMedium.get(medium.code)!.tasks.push(task);
  };

  for (const item of items) {
    const base = {
      instructionCode: item.instruction.code,
      plantTypeName: item.instruction.plantType.name,
      assignedToName: item.instruction.assignedTo?.name ?? null,
      status: item.instruction.status,
      stageCode: item.stageCode,
    };
    addTask(item.motherMedium, { ...base, purpose: "MOTHER", quantity: item.quantity });
    if (item.expectedFinishedOutput) {
      addTask(item.finishedMedium, { ...base, purpose: "FINISHED", quantity: item.expectedFinishedOutput });
    }
  }

  const groups = Array.from(byMedium.values()).sort((a, b) => a.code.localeCompare(b.code));
  const totalQuantity = groups.reduce((s, g) => s + g.tasks.reduce((s2, t) => s2 + t.quantity, 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-cyan-600" /> Nhiệm vụ pha môi trường
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tuần này · {groups.length} mã môi trường · {items.length} dòng quy cách nguồn · {totalQuantity.toLocaleString("vi-VN")} tổng số lượng cần pha
        </p>
      </div>

      {groups.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có chỉ định cấy nào cần môi trường trong tuần này</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.code}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="font-mono text-cyan-700">{g.code}</span>
                    <span className="text-gray-500 font-normal">— {g.name}</span>
                  </CardTitle>
                  <Badge variant="secondary">{g.tasks.length} nhiệm vụ</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {g.tasks.map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm border-t first:border-t-0 py-1.5">
                      <div>
                        <span className="font-mono text-blue-700">{t.instructionCode}</span>
                        <span className="text-gray-600 ml-2">{t.plantTypeName}</span>
                        {t.stageCode && (
                          <Badge variant="outline" className="ml-2">
                            {MOTHER_SPEC_LABELS[t.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? t.stageCode}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{t.purpose === "MOTHER" ? "Nhân mẫu mẹ" : "Ra rễ (TP)"}: <strong>{t.quantity.toLocaleString("vi-VN")}</strong></span>
                        <span>NV cấy: {t.assignedToName ?? "Chưa gán"}</span>
                        <Badge className={t.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {t.status === "ACTIVE" ? "Đang thực hiện" : "Nháp"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
