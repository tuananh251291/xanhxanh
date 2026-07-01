import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";

export default async function MediumTasksPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!["MOI_TRUONG", "ADMIN"].includes(role ?? "")) redirect("/dashboard");

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      status: { in: ["DRAFT", "ACTIVE"] },
      mediumTypeId: { not: null },
      OR: [
        { weekStart: { gte: weekStart, lte: weekEnd } },
        { weekStart: null, createdAt: { gte: weekStart, lte: weekEnd } },
      ],
    },
    include: {
      plantType: { select: { name: true, code: true } },
      mediumType: { select: { name: true, code: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { mediumType: { code: "asc" } },
  });

  const byMedium = instructions.reduce<Record<string, { name: string; code: string; items: typeof instructions }>>((acc, inst) => {
    if (!inst.mediumType) return acc;
    const key = inst.mediumType.code;
    if (!acc[key]) acc[key] = { name: inst.mediumType.name, code: inst.mediumType.code, items: [] };
    acc[key].items.push(inst);
    return acc;
  }, {});

  const groups = Object.values(byMedium);
  const totalMotherQuantity = instructions.reduce((s, i) => s + i.inputMotherQuantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-cyan-600" /> Nhiệm vụ pha môi trường
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tuần này · {groups.length} mã môi trường · {instructions.length} chỉ định cấy · {totalMotherQuantity.toLocaleString("vi-VN")} mẫu mẹ đầu vào
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
                  <Badge variant="secondary">{g.items.length} chỉ định</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {g.items.map((inst) => (
                    <div key={inst.id} className="flex items-center justify-between text-sm border-t first:border-t-0 py-1.5">
                      <div>
                        <span className="font-mono text-blue-700">{inst.code}</span>
                        <span className="text-gray-600 ml-2">{inst.plantType.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>NV cấy: {inst.assignedTo.name}</span>
                        <span>Mẫu mẹ: <strong>{inst.inputMotherQuantity.toLocaleString("vi-VN")}</strong></span>
                        <Badge className={inst.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {inst.status === "ACTIVE" ? "Đang thực hiện" : "Nháp"}
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
