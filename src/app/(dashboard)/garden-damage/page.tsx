import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { damageReportScope, getCareStaffGarden } from "@/lib/garden-damage";
import { GARDEN_DAMAGE_FLOW_LABELS, GARDEN_DAMAGE_STATUS_LABELS } from "@/lib/garden-receipt-constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import NewDamageReport from "./new-damage-report";

type Flow = keyof typeof GARDEN_DAMAGE_FLOW_LABELS;
type Status = keyof typeof GARDEN_DAMAGE_STATUS_LABELS;
const STATUS_BADGE: Record<Status, "info" | "in-progress" | "overdue" | "completed"> = {
  DRAFT: "info", SUBMITTED: "in-progress", RETURNED: "overdue", CONFIRMED: "completed",
};

// Phiếu ghi nhận cây hỏng (Luồng A cây nhiễm / Luồng B cây khỏe) — NV chăm sóc cây mô chỉ thấy phiếu mình lập,
// QLV thấy phiếu vườn mình quản lý, Admin thấy tất cả. Xem model GardenDamageReport.
export default async function GardenDamagePage({ searchParams }: { searchParams: Promise<{ flow?: string; status?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(await isPageAllowed(role, "/garden-damage"))) redirect("/dashboard");
  const scope = await damageReportScope(session.user);
  if (!scope) redirect("/dashboard");

  const sp = await searchParams;
  const flow = sp.flow === "CONTAMINATED" || sp.flow === "PLANNED" ? (sp.flow as Flow) : null;
  const status = Object.keys(GARDEN_DAMAGE_STATUS_LABELS).includes(sp.status ?? "") ? (sp.status as Status) : null;

  // Vườn được mở phiếu: NV → vườn của hồ sơ liên kết; QLV/Admin → vườn quản lý.
  const careGarden = role === "NV_CHAM_SOC_CAY_MO" ? await getCareStaffGarden(session.user.id) : null;
  const gardenIds = role === "NV_CHAM_SOC_CAY_MO" ? (careGarden ? [careGarden.gardenId] : []) : (await getManageableGardens(session.user)).map((g) => g.id);

  const [reports, receipts] = await Promise.all([
    prisma.gardenDamageReport.findMany({
      where: { ...scope, ...(flow ? { flow } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, code: true, flow: true, status: true, createdAt: true, confirmedAt: true,
        garden: { select: { name: true } }, createdBy: { select: { name: true } },
        receipt: { select: { code: true, createdAt: true, fromWarehouse: { select: { name: true } } } },
        items: { select: { initialQuantity: true, reportedQuantity: true, confirmedQuantity: true } },
      },
    }),
    // Phiếu bàn giao đã nhận xong, chưa có phiếu hỏng đang mở — để mở phiếu mới.
    prisma.gardenReceipt.findMany({
      where: { gardenId: { in: gardenIds }, status: "COMPLETED", damageReports: { none: { status: { not: "CONFIRMED" } } } },
      orderBy: { completedAt: "desc" },
      take: 100,
      select: { id: true, code: true, orderType: true, completedAt: true, fromWarehouse: { select: { name: true } }, garden: { select: { name: true } } },
    }),
  ]);
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { flow, status, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const str = p.toString();
    return `/garden-damage${str ? `?${str}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-primary-strong" /> Phiếu ghi nhận cây hỏng</h1>
        <p className="text-text-secondary text-sm mt-1">
          NV chăm sóc cây mô kiểm tra cây, nhập số hỏng, gửi QLV → QLV sửa (nếu cần) và xác nhận, hoặc trả lại kiểm tra lại. Chỉ trừ tồn khi QLV xác nhận — Luồng A trừ Kho nhiễm, Luồng B trừ Kho cây trồng.
        </p>
      </div>

      {role === "NV_CHAM_SOC_CAY_MO" && !careGarden ? (
        <p className="text-sm text-warning-foreground bg-warning-light rounded-lg p-3">Tài khoản chưa được Quản lý vườn liên kết vào Nhân sự vườn (vị trí Chăm sóc cây mô) — chưa mở phiếu được.</p>
      ) : gardenIds.length > 0 && (
        <NewDamageReport
          receipts={receipts.map((r) => ({
            id: r.id,
            label: `${r.code} · ${r.fromWarehouse.name} → ${r.garden.name} · ${r.completedAt ? format(r.completedAt, "dd/MM/yyyy") : ""} · ${r.orderType === "CONTAMINATED" ? "Luồng A (cây nhiễm)" : "Luồng B (cây khỏe)"}`,
          }))}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={qs({ flow: null })}><Button size="sm" variant={flow ? "outline" : "default"}>Cả 2 luồng</Button></Link>
        {(Object.keys(GARDEN_DAMAGE_FLOW_LABELS) as Flow[]).map((f) => (
          <Link key={f} href={qs({ flow: f })}><Button size="sm" variant={flow === f ? "default" : "outline"}>{f === "CONTAMINATED" ? "Luồng A — Cây nhiễm" : "Luồng B — Cây khỏe"}</Button></Link>
        ))}
        <span className="w-px bg-divider mx-1" />
        <Link href={qs({ status: null })}><Button size="sm" variant={status ? "outline" : "default"}>Mọi trạng thái</Button></Link>
        {(Object.keys(GARDEN_DAMAGE_STATUS_LABELS) as Status[]).map((s) => (
          <Link key={s} href={qs({ status: s })}><Button size="sm" variant={status === s ? "default" : "outline"}>{GARDEN_DAMAGE_STATUS_LABELS[s]}</Button></Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {reports.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">Chưa có phiếu nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã phiếu</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Luồng</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Phiếu bàn giao ban đầu</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Người lập</th>
                    <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Ban đầu</th>
                    <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Số hỏng</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const initial = r.items.reduce((s, i) => s + i.initialQuantity, 0);
                    const damaged = r.items.reduce((s, i) => s + (r.status === "CONFIRMED" ? i.confirmedQuantity ?? 0 : i.reportedQuantity), 0);
                    return (
                      <tr key={r.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-2"><Link href={`/garden-damage/${r.id}`} className="font-mono text-primary-strong underline underline-offset-2">{r.code}</Link></td>
                        <td className="px-4 py-2"><Badge variant={r.flow === "CONTAMINATED" ? "in-progress" : "info"}>{r.flow === "CONTAMINATED" ? "A — Cây nhiễm" : "B — Cây khỏe"}</Badge></td>
                        <td className="px-4 py-2 text-foreground">
                          <span className="font-mono">{r.receipt.code}</span>
                          <p className="text-xs text-text-secondary">{r.receipt.fromWarehouse.name} · {format(r.receipt.createdAt, "dd/MM/yyyy")} → {r.garden.name}</p>
                        </td>
                        <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{r.createdBy.name} · {format(r.createdAt, "dd/MM HH:mm")}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(initial)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-destructive">{fmt(damaged)}</td>
                        <td className="px-4 py-2"><Badge variant={STATUS_BADGE[r.status]}>{GARDEN_DAMAGE_STATUS_LABELS[r.status]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
