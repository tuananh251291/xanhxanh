import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import { isAdminRole, DEVIATION_CAUSE_LABELS, DEVIATION_CAUSE_COLORS } from "@/types";

const CAUSE_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "UNRESOLVED", label: "Chưa xử lý" },
  { value: "KY_THUAT_SAI", label: DEVIATION_CAUSE_LABELS.KY_THUAT_SAI },
  { value: "CAY_MO_SAI", label: DEVIATION_CAUSE_LABELS.CAY_MO_SAI },
  { value: "CAY_MO_VUOT_CHI_TIEU", label: DEVIATION_CAUSE_LABELS.CAY_MO_VUOT_CHI_TIEU },
] as const;

// Báo cáo "Lệch chỉ định & nguyên nhân" — liệt kê mọi lần alert OUTPUT_DEVIATION (NV cấy mô cấy lệch chỉ
// định quá ngưỡng, xem POST /api/daily-records) kèm nguyên nhân NV Kỹ thuật đã kết luận qua PATCH
// /api/alerts (cause null = chưa xử lý). Admin (SUPER_ADMIN/ADMIN_KY_THUAT) xem MỌI cơ sở + lọc theo kho
// qua <select>; NV Kỹ thuật/Kho mô chỉ xem đúng cơ sở mình đang làm việc (workplaceWarehouseId) — cùng
// quy ước phạm vi xem đã dùng ở reports/inspection-lane, reports/inventory-lifecycle.
export default async function OutputDeviationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouseId?: string; cause?: string; month?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") redirect("/dashboard");

  const sp = await searchParams;
  const admin = isAdminRole(role);
  const scopeWarehouseId = admin ? (sp.warehouseId?.trim() || null) : (session?.user?.workplaceWarehouseId ?? null);
  const causeFilter = sp.cause?.trim() || "";
  const monthFilter = sp.month?.trim() || "";
  // input type="month" gửi lên dạng "yyyy-MM" thuần — new Date("yyyy-MM") parse theo UTC, lệch múi giờ VN
  // (UTC+7) như đã xử lý ở nơi khác (xem parseLocalDate, POST /api/extra-work-requests) — thêm "-01" +
  // giờ rõ ràng để Date parse theo LOCAL time.
  const monthDate = monthFilter ? new Date(`${monthFilter}-01T00:00:00`) : null;
  const hasValidMonth = !!monthDate && !Number.isNaN(monthDate.getTime());

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
      where: {
        type: "OUTPUT_DEVIATION",
        relatedType: "PlantingInstruction",
        ...(hasValidMonth ? { createdAt: { gte: startOfMonth(monthDate!), lte: endOfMonth(monthDate!) } } : {}),
        ...(causeFilter === "UNRESOLVED"
          ? { cause: null }
          : causeFilter === "KY_THUAT_SAI" || causeFilter === "CAY_MO_SAI" || causeFilter === "CAY_MO_VUOT_CHI_TIEU"
            ? { cause: causeFilter }
            : {}),
      },
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

  const resolutions = alerts.length
    ? await prisma.outputDeviationResolution.findMany({
        where: { alertId: { in: alerts.map((a) => a.id) } },
        select: {
          alertId: true,
          reasonText: true,
          staffResponse: true,
          errorTypes: { select: { errorType: { select: { label: true } } } },
        },
      })
    : [];
  const resolutionByAlertId = new Map(resolutions.map((r) => [r.alertId, r]));

  const rows = alerts
    .map((a) => {
      const instruction = a.relatedId ? instructionById.get(a.relatedId) : null;
      if (!instruction) return null;
      const warehouseId = instruction.items[0]?.shelf?.warehouseId ?? null;
      const warehouse = instruction.items[0]?.shelf?.warehouse ?? null;
      const resolution = resolutionByAlertId.get(a.id) ?? null;
      return { alertId: a.id, message: a.message, cause: a.cause, createdAt: a.createdAt, instruction, warehouseId, warehouse, resolution };
    })
    .filter((r): r is NonNullable<typeof r> => !!r && (!scopeWarehouseId || r.warehouseId === scopeWarehouseId));

  // Tổng hợp nhanh dưới bộ lọc — 2 mục đếm đầu tính TRÊN CHÍNH `rows` đã lọc (đổi theo bộ lọc Tháng/
  // Nguyên nhân/Khu sản xuất đang chọn). Riêng cảnh báo "tái phạm" LUÔN tính theo cửa sổ 30 ngày gần nhất
  // từ HÔM NAY — độc lập với bộ lọc Tháng đang xem (đây là cảnh báo hiện tại, không phải số liệu lịch sử
  // của kỳ đang duyệt), chỉ tôn trọng phạm vi Khu sản xuất đang chọn (cùng quy ước với `rows` ở trên).
  const causeCounts = { CAY_MO_SAI: 0, KY_THUAT_SAI: 0, UNRESOLVED: 0 };
  for (const r of rows) {
    if (r.cause === "CAY_MO_SAI") causeCounts.CAY_MO_SAI += 1;
    else if (r.cause === "KY_THUAT_SAI") causeCounts.KY_THUAT_SAI += 1;
    else causeCounts.UNRESOLVED += 1;
  }

  const recentCayMoSaiAlerts = await prisma.alert.findMany({
    where: { type: "OUTPUT_DEVIATION", relatedType: "PlantingInstruction", cause: "CAY_MO_SAI", createdAt: { gte: subDays(new Date(), 30) } },
    select: { relatedId: true },
  });
  const recentInstructionIds = Array.from(new Set(recentCayMoSaiAlerts.map((a) => a.relatedId).filter((v): v is string => !!v)));
  const recentInstructions = recentInstructionIds.length
    ? await prisma.plantingInstruction.findMany({
        where: { id: { in: recentInstructionIds } },
        select: {
          assignedToId: true,
          assignedTo: { select: { code: true, name: true } },
          items: { take: 1, select: { shelf: { select: { warehouseId: true } } } },
        },
      })
    : [];
  const repeatCountByStaff = new Map<string, { code: string; name: string; count: number }>();
  for (const inst of recentInstructions) {
    if (!inst.assignedToId || !inst.assignedTo) continue;
    const whId = inst.items[0]?.shelf?.warehouseId ?? null;
    if (scopeWarehouseId && whId !== scopeWarehouseId) continue;
    const entry = repeatCountByStaff.get(inst.assignedToId) ?? { code: inst.assignedTo.code, name: inst.assignedTo.name, count: 0 };
    entry.count += 1;
    repeatCountByStaff.set(inst.assignedToId, entry);
  }
  const repeatOffenders = Array.from(repeatCountByStaff.values())
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <Header />

      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-wrap items-end gap-3">
            {admin && (
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
            )}
            <div className="space-y-1">
              <Label className="text-xs">Nguyên nhân</Label>
              <select
                name="cause"
                defaultValue={causeFilter}
                className="h-9 w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {CAUSE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tháng</Label>
              <Input type="month" name="month" defaultValue={monthFilter} className="w-40" />
            </div>
            <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
              <Search className="w-4 h-4 mr-1" /> Lọc
            </Button>
            {((admin && scopeWarehouseId) || causeFilter || monthFilter) && (
              <Link href="/reports/output-deviation">
                <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm text-text-secondary">
            Có <strong className="text-foreground">{rows.length}</strong> chỉ định cấy sai (theo bộ lọc đang chọn)
          </p>
          <div className="flex flex-wrap gap-3">
            <p className="text-sm bg-danger-light text-destructive rounded-md px-3 py-2">
              Bao gồm <strong>{causeCounts.CAY_MO_SAI}</strong> CĐC sai do NV cấy mô cấy sai chỉ định
            </p>
            <p className="text-sm bg-warning-light text-warning-foreground rounded-md px-3 py-2">
              Bao gồm <strong>{causeCounts.KY_THUAT_SAI}</strong> CĐC sai do NV Kỹ thuật ra CĐC sai
            </p>
            {causeCounts.UNRESOLVED > 0 && (
              <p className="text-sm bg-info-light text-info-foreground rounded-md px-3 py-2">
                Còn <strong>{causeCounts.UNRESOLVED}</strong> CĐC chưa xác định nguyên nhân
              </p>
            )}
          </div>
          {repeatOffenders.length > 0 && (
            <div className="bg-danger-light text-destructive rounded-md px-3 py-2">
              <p className="text-sm mb-2">
                Có những nhân sự sau đã cấy sai CĐC từ lần thứ 2 trở lên trong vòng 1 tháng gần đây (nhiều
                lần nhất ở trên):
              </p>
              <table className="text-sm">
                <tbody>
                  {repeatOffenders.map((s) => (
                    <tr key={s.code}>
                      <td className="pr-3 py-0.5 font-mono">{s.code}</td>
                      <td className="pr-3 py-0.5">{s.name}</td>
                      <td className="py-0.5 text-right font-semibold tabular-nums">{s.count} lần</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Chi tiết xử lý</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Phản hồi NV</th>
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
                          <Badge className={DEVIATION_CAUSE_COLORS[r.cause]}>
                            {DEVIATION_CAUSE_LABELS[r.cause]}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Chưa xử lý</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {r.cause === "CAY_MO_SAI" && r.resolution && r.resolution.errorTypes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.resolution.errorTypes.map((et, idx) => (
                              <Badge key={idx} className="bg-danger-light text-destructive">{et.errorType.label}</Badge>
                            ))}
                          </div>
                        ) : r.cause === "KY_THUAT_SAI" && r.resolution?.reasonText ? (
                          <span className="text-text-secondary">{r.resolution.reasonText}</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.cause !== "CAY_MO_SAI" ? (
                          <span className="text-text-muted">—</span>
                        ) : r.resolution?.staffResponse === "ACCEPTED" ? (
                          <Badge className="bg-success-light text-success-foreground">Đã xác nhận</Badge>
                        ) : r.resolution?.staffResponse === "DISAGREED" ? (
                          <Badge className="bg-danger-light text-destructive">Không đồng ý</Badge>
                        ) : (
                          <Badge variant="secondary">Chờ phản hồi</Badge>
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
