import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Leaf, Package, AlertTriangle, ClipboardList } from "lucide-react";
import { startOfMonth } from "date-fns";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export default async function MyReportsPage() {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") redirect("/dashboard");
  const userId = session.user.id;
  const monthStart = startOfMonth(new Date());

  const [monthLots, activeInstructions, recentRecords, contaminated] = await Promise.all([
    prisma.lot.findMany({
      where: { instruction: { assignedToId: userId }, enteredAt: { gte: monthStart } },
      select: { stage: true, quantity: true, initialQuantity: true },
    }),
    prisma.plantingInstruction.count({ where: { assignedToId: userId, status: "ACTIVE" } }),
    prisma.dailyRecord.findMany({
      where: { staffId: userId },
      include: {
        instruction: { select: { code: true, plantType: { select: { name: true } } } },
        items: { select: { stage: true, quantityCreated: true } },
      },
      orderBy: { recordDate: "desc" },
      take: 10,
    }),
    prisma.contaminationRecord.aggregate({
      where: { lot: { instruction: { assignedToId: userId } }, recordDate: { gte: monthStart } },
      _sum: { quantity: true },
    }),
  ]);

  const motherThisMonth = monthLots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.initialQuantity, 0);
  const finishedThisMonth = monthLots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.initialQuantity, 0);
  const totalInitial = monthLots.reduce((s, l) => s + l.initialQuantity, 0);
  const contaminatedQty = contaminated._sum.quantity ?? 0;
  const contaminationRate = totalInitial > 0 ? contaminatedQty / totalInitial : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-green-600" /> Báo cáo cá nhân
        </h1>
        <p className="text-gray-500 text-sm mt-1">Sản lượng và tỉ lệ nhiễm tháng {format(new Date(), "MM/yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Chỉ định đang thực hiện" value={activeInstructions} icon={ClipboardList} color="blue" />
        <StatCard title="Mẫu mẹ tạo ra" value={motherThisMonth} icon={Leaf} color="purple" />
        <StatCard title="Thành phẩm tạo ra" value={finishedThisMonth} icon={Package} color="green" />
        <StatCard
          title="Tỉ lệ nhiễm"
          value={`${Math.round(contaminationRate * 100)}%`}
          icon={AlertTriangle}
          color={contaminationRate > 0.2 ? "red" : "yellow"}
          subtitle={`${contaminatedQty.toLocaleString("vi-VN")} / ${totalInitial.toLocaleString("vi-VN")}`}
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nhật ký cấy gần đây</CardTitle></CardHeader>
        <CardContent>
          {recentRecords.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Chưa có nhật ký nào</p>
          ) : (
            <div className="space-y-2">
              {recentRecords.map((r) => {
                const mother = r.items.filter((i) => i.stage === "MAU_ME").reduce((s, i) => s + i.quantityCreated, 0);
                const finished = r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s, i) => s + i.quantityCreated, 0);
                return (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-medium">
                        <span className="font-mono text-blue-700">{r.instruction.code}</span>
                        <span className="text-gray-500 ml-2">{r.instruction.plantType.name}</span>
                      </p>
                      <p className="text-xs text-gray-400">{format(r.recordDate, "dd/MM/yyyy", { locale: vi })} · Dùng {r.motherUsed.toLocaleString("vi-VN")} mẫu mẹ</p>
                    </div>
                    <div className="flex gap-2">
                      {mother > 0 && <Badge className="bg-purple-100 text-purple-700">MM +{mother.toLocaleString("vi-VN")}</Badge>}
                      {finished > 0 && <Badge className="bg-green-100 text-green-700">TP +{finished.toLocaleString("vi-VN")}</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, color, subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: "green" | "blue" | "yellow" | "purple" | "red";
  subtitle?: string;
}) {
  const colorMap = {
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    yellow: "bg-amber-100 text-amber-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
            </p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
