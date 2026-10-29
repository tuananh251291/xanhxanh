import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { GARDEN_STOCK_POOL_LABELS } from "@/lib/garden-receipt-constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes } from "lucide-react";

type Pool = keyof typeof GARDEN_STOCK_POOL_LABELS;
const POOLS: Pool[] = ["CONTAMINATED", "PLANNED"];

// Báo cáo tồn kho vườn + số cây hỏng — 2 kho: Kho nhiễm (nhận từ lệnh cây nhiễm, Luồng A) và Kho cây trồng (lệnh
// có kế hoạch, Luồng B). "Đã hỏng" = tổng số hỏng ĐÃ được QLV xác nhận (phiếu ghi nhận cây hỏng, đã trừ khỏi
// tồn). Chưa phân bổ theo giàn kệ/dãy. Quản lý vườn thấy vườn mình quản lý, Admin thấy mọi vườn.
export default async function GardenStockPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isAdminRole(role)) || !(await isPageAllowed(role, "/garden-stock"))) {
    redirect("/dashboard");
  }
  const gardens = await getManageableGardens(session.user);
  const gardenIds = gardens.map((g) => g.id);
  const [stocks, damaged, finished] = await Promise.all([
    prisma.gardenStock.findMany({
      where: { gardenId: { in: gardenIds } },
      select: { gardenId: true, pool: true, plantTypeId: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
      orderBy: [{ plantType: { code: "asc" } }, { stageCode: "asc" }],
    }),
    prisma.gardenDamageItem.findMany({
      where: { report: { gardenId: { in: gardenIds }, status: "CONFIRMED" }, confirmedQuantity: { gt: 0 } },
      select: { plantTypeId: true, stageCode: true, confirmedQuantity: true, report: { select: { gardenId: true, flow: true } } },
    }),
    // Kho thành phẩm vườn — cây đạt size S sau Chăm sóc cây mô (không còn phân biệt nhiễm/khỏe).
    prisma.gardenFinishedStock.findMany({
      where: { gardenId: { in: gardenIds }, quantity: { gt: 0 } },
      select: { gardenId: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
      orderBy: [{ plantType: { code: "asc" } }, { stageCode: "asc" }],
    }),
  ]);
  const damagedBy = new Map<string, number>();
  for (const d of damaged) {
    const key = `${d.report.gardenId}:${d.report.flow}:${d.plantTypeId}:${d.stageCode}`;
    damagedBy.set(key, (damagedBy.get(key) ?? 0) + (d.confirmedQuantity ?? 0));
  }
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Boxes className="w-6 h-6 text-primary-strong" /> Tồn kho vườn</h1>
        <p className="text-text-secondary text-sm mt-1">
          Kho thành phẩm vườn (cây đạt size S), Kho nhiễm (Luồng A) và Kho cây trồng (Luồng B) — tồn hiện tại và số cây hỏng đã được QLV xác nhận (xem{" "}
          <Link href="/garden-damage" className="text-primary-strong underline underline-offset-2">Phiếu ghi nhận cây hỏng</Link>). Chưa phân bổ theo giàn kệ.
        </p>
      </div>
      {gardens.length === 0 && <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>}
      {gardens.map((g) => {
        const rows = finished.filter((r) => r.gardenId === g.id);
        return (
          <Card key={`${g.id}:finished`}>
            <CardHeader><CardTitle className="text-base">{g.name} — Kho thành phẩm vườn: {fmt(rows.reduce((s, r) => s + r.quantity, 0))} cây</CardTitle></CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">Chưa có cây đạt quy cách</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                        <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                        <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                        <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Số lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={`${r.plantType.code}:${r.stageCode}`} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-2 font-mono text-text-secondary">{r.plantType.code}</td>
                          <td className="px-4 py-2 text-foreground">{r.plantType.name}</td>
                          <td className="px-4 py-2">{r.stageCode}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmt(r.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {gardens.flatMap((g) =>
        POOLS.map((pool) => {
          const rows = stocks.filter((s) => s.gardenId === g.id && s.pool === pool && (s.quantity > 0 || damagedBy.has(`${g.id}:${pool}:${s.plantTypeId}:${s.stageCode}`)));
          const total = rows.reduce((s, r) => s + r.quantity, 0);
          const totalDamaged = rows.reduce((s, r) => s + (damagedBy.get(`${g.id}:${pool}:${r.plantTypeId}:${r.stageCode}`) ?? 0), 0);
          return (
            <Card key={`${g.id}:${pool}`}>
              <CardHeader>
                <CardTitle className="text-base">{g.name} — {GARDEN_STOCK_POOL_LABELS[pool]}: {fmt(total)} cây tồn · {fmt(totalDamaged)} cây hỏng</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-6">Chưa có tồn</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                          <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                          <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                          <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Tồn hiện tại</th>
                          <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Đã hỏng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const dmg = damagedBy.get(`${g.id}:${pool}:${r.plantTypeId}:${r.stageCode}`) ?? 0;
                          return (
                            <tr key={`${r.plantTypeId}:${r.stageCode}`} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                              <td className="px-4 py-2 font-mono text-text-secondary">{r.plantType.code}</td>
                              <td className="px-4 py-2 text-foreground">{r.plantType.name}</td>
                              <td className="px-4 py-2">{r.stageCode}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{fmt(r.quantity)}</td>
                              <td className={`px-4 py-2 text-right tabular-nums ${dmg > 0 ? "text-destructive font-medium" : "text-text-muted"}`}>{fmt(dmg)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
