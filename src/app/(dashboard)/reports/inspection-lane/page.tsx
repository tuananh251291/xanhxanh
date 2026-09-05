import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";
import { isAdminRole, INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";
import { format } from "date-fns";

const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

// Đỏ trước, đến Vàng, rồi Xanh — chưa có dữ liệu xếp cuối cùng. Trong cùng 1 luồng, % nhiễm tổng hợp
// cao xếp lên đầu (NV cần chú ý nhất luôn nổi lên trên, dù đang ở luồng nào).
const LANE_SORT_PRIORITY: Record<"DO" | "VANG" | "XANH", number> = { DO: 0, VANG: 1, XANH: 2 };

// Báo cáo "Phân loại luồng kiểm tra theo cơ sở" — xem NV cấy mô nào đang thuộc luồng Xanh/Vàng/Đỏ, gộp
// theo TỪNG khu sản xuất. Admin xem được MỌI cơ sở; NV Kỹ thuật/Kho mô chỉ xem đúng cơ sở mình đang được
// gán (workplaceWarehouseId) — cùng quy ước phạm vi xem đã dùng ở rooting-forecast/production-capacity.
// Luồng do hệ thống tự tính mỗi tháng, xem src/lib/inspection-lane.ts — trang này CHỈ XEM, không sửa.
export default async function InspectionLaneReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") redirect("/dashboard");

  const scopeWarehouseId = isAdminRole(role) ? null : (session?.user?.workplaceWarehouseId ?? null);
  if (!isAdminRole(role) && !scopeWarehouseId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Flag className="w-6 h-6 text-info-foreground" /> Phân loại luồng kiểm tra theo cơ sở
          </h1>
        </div>
        <Card><CardContent className="py-12 text-center text-text-muted">
          Bạn chưa được gán địa điểm làm việc — liên hệ Admin cấp cao để được gán trước khi xem báo cáo này.
        </CardContent></Card>
      </div>
    );
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT", isActive: true, ...(scopeWarehouseId ? { id: scopeWarehouseId } : {}) },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  const staff = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, workplaceWarehouseId: { in: warehouses.map((w) => w.id) } },
    select: {
      id: true,
      code: true,
      name: true,
      workplaceWarehouseId: true,
      inspectionLane: true,
      inspectionLaneMonthlyResults: {
        orderBy: { applyMonth: "desc" },
        take: 1,
        select: { applyMonth: true, darkRoomRatePct: true, brightRoomRatePct: true, combinedRatePct: true },
      },
    },
    orderBy: { code: "asc" },
  });

  const staffByWarehouse = new Map<string, typeof staff>();
  for (const s of staff) {
    if (!s.workplaceWarehouseId) continue;
    const list = staffByWarehouse.get(s.workplaceWarehouseId) ?? [];
    list.push(s);
    staffByWarehouse.set(s.workplaceWarehouseId, list);
  }
  for (const list of staffByWarehouse.values()) {
    list.sort((a, b) => {
      const pa = a.inspectionLane ? LANE_SORT_PRIORITY[a.inspectionLane] : 3;
      const pb = b.inspectionLane ? LANE_SORT_PRIORITY[b.inspectionLane] : 3;
      if (pa !== pb) return pa - pb;
      const ra = a.inspectionLaneMonthlyResults[0]?.combinedRatePct ?? -1;
      const rb = b.inspectionLaneMonthlyResults[0]?.combinedRatePct ?? -1;
      return rb - ra;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Flag className="w-6 h-6 text-info-foreground" /> Phân loại luồng kiểm tra theo cơ sở
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Luồng Xanh/Vàng/Đỏ hệ thống tự tính đầu mỗi tháng từ tỉ lệ nhiễm tháng trước — Vàng và Đỏ đều
          phải Kho mô kiểm tra lại khi nhận bàn giao, chỉ Xanh được tin tưởng không kiểm tra lại.
        </p>
      </div>

      {warehouses.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">Không có cơ sở sản xuất nào</CardContent></Card>
      ) : (
        warehouses.map((wh) => {
          const rows = staffByWarehouse.get(wh.id) ?? [];
          return (
            <Card key={wh.id}>
              <CardHeader>
                <CardTitle className="text-base">{wh.code} — {wh.name}</CardTitle>
                <p className="text-sm text-text-secondary">{rows.length} nhân viên cấy mô</p>
              </CardHeader>
              <CardContent className="p-0">
                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">Chưa có nhân viên cấy mô nào thuộc cơ sở này</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light">
                          <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã NV</th>
                          <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên NV</th>
                          <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Luồng hiện tại</th>
                          <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Nhiễm ủ tối</th>
                          <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Nhiễm MM bàn giao</th>
                          <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Tổng hợp</th>
                          <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tính theo tháng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((u) => {
                          const latest = u.inspectionLaneMonthlyResults[0] ?? null;
                          return (
                            <tr key={u.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60 transition-colors">
                              <td className="px-4 py-3 font-mono text-foreground">{u.code}</td>
                              <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                              <td className="px-4 py-3">
                                {u.inspectionLane ? (
                                  <Badge className={INSPECTION_LANE_COLORS[u.inspectionLane]}>{INSPECTION_LANE_LABELS[u.inspectionLane]}</Badge>
                                ) : (
                                  <Badge variant="secondary">Chưa có dữ liệu</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-text-secondary">{latest ? fmtPct(latest.darkRoomRatePct) : "—"}</td>
                              <td className="px-4 py-3 text-right text-text-secondary">{latest ? fmtPct(latest.brightRoomRatePct) : "—"}</td>
                              <td className="px-4 py-3 text-right font-medium text-foreground">{latest ? fmtPct(latest.combinedRatePct) : "—"}</td>
                              <td className="px-4 py-3 text-text-secondary">{latest ? format(latest.applyMonth, "MM/yyyy") : "—"}</td>
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
