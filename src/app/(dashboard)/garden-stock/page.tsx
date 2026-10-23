import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes } from "lucide-react";

// Tồn kho cây của vườn (GardenStock) — cộng khi phiếu bàn giao cây mô về vườn hoàn thành (xem /garden-receipts).
// Chưa phân bổ theo giàn kệ/dãy. Quản lý vườn thấy vườn mình quản lý, Admin thấy mọi vườn.
export default async function GardenStockPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isAdminRole(role)) || !(await isPageAllowed(role, "/garden-stock"))) {
    redirect("/dashboard");
  }
  const gardens = await getManageableGardens(session.user);
  const stocks = await prisma.gardenStock.findMany({
    where: { gardenId: { in: gardens.map((g) => g.id) }, quantity: { gt: 0 } },
    select: { gardenId: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
    orderBy: [{ plantType: { code: "asc" } }, { stageCode: "asc" }],
  });
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Boxes className="w-6 h-6 text-primary-strong" /> Tồn kho vườn</h1>
        <p className="text-text-secondary text-sm mt-1">Số cây đã nhận vào vườn qua phiếu bàn giao (chưa phân bổ theo giàn kệ).</p>
      </div>
      {gardens.length === 0 && <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>}
      {gardens.map((g) => {
        const rows = stocks.filter((s) => s.gardenId === g.id);
        const total = rows.reduce((s, r) => s + r.quantity, 0);
        return (
          <Card key={g.id}>
            <CardHeader><CardTitle className="text-base">{g.name} ({g.code}) — {rows.length} mã · {fmt(total)} cây</CardTitle></CardHeader>
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
    </div>
  );
}
