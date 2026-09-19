import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isAdminRole, DEVIATION_CAUSE_LABELS } from "@/types";

// Báo cáo "Lệch chỉ định & nguyên nhân" — liệt kê mọi lần alert OUTPUT_DEVIATION (NV cấy mô cấy lệch chỉ
// định quá ngưỡng, xem POST /api/daily-records) kèm nguyên nhân NV Kỹ thuật đã kết luận qua PATCH
// /api/alerts (cause null = chưa xử lý). Admin (SUPER_ADMIN/ADMIN_KY_THUAT) xem MỌI cơ sở + lọc theo kho
// qua <select>; NV Kỹ thuật/Kho mô chỉ xem đúng cơ sở mình đang làm việc (workplaceWarehouseId) — cùng
// quy ước phạm vi xem đã dùng ở reports/inspection-lane, reports/inventory-lifecycle.
export default async function OutputDeviationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouseId?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") redirect("/dashboard");

  const sp = await searchParams;
  const admin = isAdminRole(role);
  const scopeWarehouseId = admin ? (sp.warehouseId?.trim() || null) : (session?.user?.workplaceWarehouseId ?? null);

  if (!admin && !scopeWarehouseId) {
    return (
      <div className="space-y-6">
        <Header />
        <Card><CardContent className="py-12 text-center text-text-muted">
          Bạn chưa được gán địa điểm làm việc — liên hệ Admin cấp cao để được gán trước khi xem báo cáo này.
        </CardContent></Card>
      </div>
    );
  }

  const [alerts, warehouses] = await Promise.all([
    prisma.alert.findMany({
      where: { type: "OUTPUT_DEVIATION", relatedType: "PlantingInstruction" },
      select: { id: true, relatedId: true, message: true, cause: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    admin
      ? prisma.warehouse.findMany({ where: { type: "SAN_XUAT", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const instructionIds = Array.from(new Set(alerts.map((a) => a.relatedId).filter((v): v is string => !!v)));
  const instructions = instructionIds.length
    ? await prisma.plantingInstruction.findMany({
        where: { id: { in: instructionIds } },
        select: {
          id: true,
          code: true,
          plantType: { select: { code: true, name: true } },
          assignedTo: { select: { code: true, name: true } },
          createdBy: { select: { code: true, name: true } },
          items: { take: 1, select: { shelf: { select: { warehouseId: true, warehouse: { select: { code: true, name: true } } } } } },
        },
      })
    : [];
  const instructionById = new Map(instructions.map((i) => [i.id, i]));

  const rows = alerts
    .map((a) => {
      const instruction = a.relatedId ? instructionById.get(a.relatedId) : null;
      if (!instruction) return null;
      const warehouseId = instruction.items[0]?.shelf?.warehouseId ?? null;
      const warehouse = instruction.items[0]?.shelf?.warehouse ?? null;
      return { alertId: a.id, message: a.message, cause: a.cause, createdAt: a.createdAt, instruction, warehouseId, warehouse };
    })
    .filter((r): r is NonNullable<typeof r> => !!r && (!scopeWarehouseId || r.warehouseId === scopeWarehouseId));

  return (
    <div className="space-y-6">
      <Header />

      {admin && (
        <Card>
          <CardContent className="pt-4">
            <form className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Khu sản xuất</Label>
                <select
                  name="warehouseId"
                  defaultValue={scopeWarehouseId ?? ""}
                  className="h-9 w-64 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Tất cả khu sản xuất</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
                <Search className="w-4 h-4 mr-1" /> Lọc
              </Button>
              {scopeWarehouseId && (
                <Link href="/reports/output-deviation">
                  <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
                </Link>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-12">Không có lần lệch chỉ định nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Chỉ định</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV cấy mô</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV Kỹ thuật</th>
                    {admin && <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Khu sản xuất</th>}
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Ngày phát hiện</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Chi tiết</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Nguyên nhân</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.alertId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-foreground">
                        {r.instruction.code}
                        <div className="text-xs text-text-muted font-sans">{r.instruction.plantType.code} — {r.instruction.plantType.name}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {r.instruction.assignedTo ? `${r.instruction.assignedTo.code} — ${r.instruction.assignedTo.name}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{r.instruction.createdBy.code} — {r.instruction.createdBy.name}</td>
                      {admin && <td className="px-4 py-3 text-text-secondary">{r.warehouse ? `${r.warehouse.code} — ${r.warehouse.name}` : "—"}</td>}
                      <td className="px-4 py-3 text-text-secondary">{format(r.createdAt, "dd/MM/yyyy HH:mm", { locale: vi })}</td>
                      <td className="px-4 py-3 text-text-secondary max-w-xs">{r.message}</td>
                      <td className="px-4 py-3">
                        {r.cause ? (
                          <Badge className={r.cause === "KY_THUAT_SAI" ? "bg-warning-light text-warning-foreground" : "bg-danger-light text-destructive"}>
                            {DEVIATION_CAUSE_LABELS[r.cause]}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Chưa xử lý</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <AlertTriangle className="w-6 h-6 text-primary-strong" /> Lệch chỉ định & nguyên nhân
      </h1>
      <p className="text-text-secondary text-sm mt-1">
        Các lần NV cấy mô cấy lệch chỉ định quá ngưỡng, kèm nguyên nhân NV Kỹ thuật đã kết luận
      </p>
    </div>
  );
}
