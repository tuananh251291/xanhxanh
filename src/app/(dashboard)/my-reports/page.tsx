import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Leaf, Package, ClipboardList, Search } from "lucide-react";
import { startOfMonth, startOfDay, endOfDay, subDays, format } from "date-fns";
import { vi } from "date-fns/locale";
import { isPageAllowed } from "@/lib/permissions";
import Link from "next/link";

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !(await isPageAllowed(session.user.role, "/my-reports"))) redirect("/dashboard");
  const userId = session.user.id;
  const monthStart = startOfMonth(new Date());

  const sp = await searchParams;
  const fromFilter = sp.from?.trim() ?? "";
  const toFilter = sp.to?.trim() ?? "";
  const parsedFrom = fromFilter ? new Date(fromFilter) : subDays(new Date(), 13);
  const parsedTo = toFilter ? new Date(toFilter) : new Date();
  const from = Number.isNaN(parsedFrom.getTime()) ? subDays(new Date(), 13) : startOfDay(parsedFrom);
  const to = Number.isNaN(parsedTo.getTime()) ? new Date() : endOfDay(parsedTo);
  const hasDateFilter = !!(fromFilter || toFilter);

  const [monthLots, activeInstructions, recentRecords, darkRoomInspections] = await Promise.all([
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
    // Tỉ lệ nhiễm cá nhân = CHỈ tính phần tự phát hiện lúc kiểm tra phòng tối sau đủ ngày ủ tối thiểu
    // (LotInspection/LotInspectionItem, xem dashboard-basic/kiem-tra-nhiem) — KHÔNG cộng thêm phần Kho mô
    // phát hiện lúc kiểm tra lại (luồng Đỏ, xem api/reports/dark-room-contamination) vì đó không thuộc
    // trách nhiệm tự kiểm tra của chính NV, không nên tính vào đánh giá cá nhân.
    prisma.lotInspection.findMany({
      where: { staffId: userId, createdAt: { gte: from, lte: to } },
      select: { createdAt: true, items: { select: { initialQuantity: true, contaminatedQuantity: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const motherThisMonth = monthLots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.initialQuantity, 0);
  const finishedThisMonth = monthLots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.initialQuantity, 0);

  const dayRows = new Map<string, { date: string; totalCreated: number; contaminated: number }>();
  for (const insp of darkRoomInspections) {
    const key = format(insp.createdAt, "yyyy-MM-dd");
    if (!dayRows.has(key)) dayRows.set(key, { date: key, totalCreated: 0, contaminated: 0 });
    const bucket = dayRows.get(key)!;
    for (const item of insp.items) {
      bucket.totalCreated += item.initialQuantity;
      bucket.contaminated += item.contaminatedQuantity;
    }
  }
  const contaminationRows = Array.from(dayRows.values()).sort((a, b) => b.date.localeCompare(a.date));
  const totalCreated = contaminationRows.reduce((s, r) => s + r.totalCreated, 0);
  const totalContaminated = contaminationRows.reduce((s, r) => s + r.contaminated, 0);
  const overallRatePct = totalCreated > 0 ? Math.round((totalContaminated / totalCreated) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-strong" /> Báo cáo cá nhân
        </h1>
        <p className="text-text-secondary text-sm mt-1">Sản lượng tháng {format(new Date(), "MM/yyyy")} và tỉ lệ nhiễm phòng tối</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Chỉ định đang thực hiện" value={activeInstructions} icon={ClipboardList} color="blue" />
        <StatCard title="Mẫu mẹ tạo ra" value={motherThisMonth} icon={Leaf} color="purple" />
        <StatCard title="Thành phẩm tạo ra" value={finishedThisMonth} icon={Package} color="green" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Tỉ lệ nhiễm phòng tối</CardTitle>
              <p className="text-sm text-text-secondary mt-1">
                Nhiễm tự phát hiện lúc kiểm tra sau đủ ngày ủ tối — theo ngày kiểm tra
              </p>
            </div>
            <form className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Từ ngày</Label>
                <Input type="date" name="from" defaultValue={fromFilter || format(from, "yyyy-MM-dd")} className="w-36" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đến ngày</Label>
                <Input type="date" name="to" defaultValue={toFilter || format(to, "yyyy-MM-dd")} className="w-36" />
              </div>
              <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
                <Search className="w-4 h-4 mr-1" /> Xem
              </Button>
              {hasDateFilter && (
                <Link href="/my-reports">
                  <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
                </Link>
              )}
            </form>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            Tổng nhiễm: <strong className="text-destructive">{totalContaminated.toLocaleString("vi-VN")}</strong> / {totalCreated.toLocaleString("vi-VN")} · Tỉ lệ: <strong>{overallRatePct}%</strong>
          </p>
        </CardHeader>
        <CardContent>
          {contaminationRows.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Không có dữ liệu kiểm tra phòng tối trong khoảng thời gian này</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-left text-primary-strong">
                    <th className="py-2 px-3 font-bold text-base">Ngày</th>
                    <th className="py-2 px-3 font-bold text-base text-right">Tổng tạo ra</th>
                    <th className="py-2 px-3 font-bold text-base text-right">Nhiễm</th>
                    <th className="py-2 px-3 font-bold text-base text-right">Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {contaminationRows.map((r) => {
                    const ratePct = r.totalCreated > 0 ? Math.round((r.contaminated / r.totalCreated) * 1000) / 10 : 0;
                    return (
                      <tr key={r.date} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="py-2 px-3">{format(new Date(r.date), "dd/MM/yyyy", { locale: vi })}</td>
                        <td className="py-2 px-3 text-right">{r.totalCreated.toLocaleString("vi-VN")}</td>
                        <td className="py-2 px-3 text-right text-destructive font-medium">{r.contaminated.toLocaleString("vi-VN")}</td>
                        <td className="py-2 px-3 text-right font-bold">{ratePct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Nhật ký cấy gần đây</CardTitle></CardHeader>
        <CardContent>
          {recentRecords.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có nhật ký nào</p>
          ) : (
            <div className="space-y-2">
              {recentRecords.map((r) => {
                const mother = r.items.filter((i) => i.stage === "MAU_ME").reduce((s, i) => s + i.quantityCreated, 0);
                const finished = r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s, i) => s + i.quantityCreated, 0);
                return (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-background rounded-lg text-sm">
                    <div>
                      <p className="font-medium">
                        <span className="font-mono text-info-foreground">{r.instruction.code}</span>
                        <span className="text-text-secondary ml-2">{r.instruction.plantType.name}</span>
                      </p>
                      <p className="text-xs text-text-muted">{format(r.recordDate, "dd/MM/yyyy", { locale: vi })} · Dùng {r.motherUsed.toLocaleString("vi-VN")} mẫu mẹ</p>
                    </div>
                    <div className="flex gap-2">
                      {mother > 0 && <Badge className="bg-violet-light text-violet-foreground">MM +{mother.toLocaleString("vi-VN")}</Badge>}
                      {finished > 0 && <Badge className="bg-primary-light text-primary-strong">TP +{finished.toLocaleString("vi-VN")}</Badge>}
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
  title, value, icon: Icon, color,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: "green" | "blue" | "yellow" | "purple" | "red";
}) {
  const colorMap = {
    green: "bg-primary-light text-primary-strong",
    blue: "bg-info-light text-info-foreground",
    yellow: "bg-warning-light text-warning-foreground",
    purple: "bg-violet-light text-violet-foreground",
    red: "bg-danger-light text-destructive",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
