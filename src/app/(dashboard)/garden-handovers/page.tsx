import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sprout } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import ConfirmGardenHandoverButton from "./confirm-garden-handover-button";

// "Bàn giao về Vườn sản xuất" — phiếu tự tạo khi Admin cấp cao duyệt Đề xuất trồng của Kho thành phẩm (xem
// GardenHandover). Quản lý vườn thấy phiếu về vườn mình phụ trách và bấm xác nhận; Kho thành phẩm xem phiếu
// của kho mình; Admin xem tất cả.
export default async function GardenHandoversPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(await isPageAllowed(role, "/garden-handovers"))) redirect("/dashboard");

  const where: Prisma.GardenHandoverWhereInput = {};
  if (isKhoThanhPhamRole(role)) where.warehouseId = session.user.workplaceWarehouseId ?? "";
  else if (!isAdminRole(role)) where.productionGarden = { managerId: session.user.id };

  const handovers = await prisma.gardenHandover.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, code: true, status: true, createdAt: true, confirmedAt: true,
      productionGarden: { select: { code: true, name: true, managerId: true } },
      warehouse: { select: { name: true } },
      confirmedBy: { select: { name: true } },
      proposals: {
        select: { id: true, code: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Bàn giao cây về Vườn sản xuất
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Phiếu tự tạo khi Admin cấp cao duyệt Đề xuất trồng của Kho thành phẩm — Quản lý vườn xác nhận khi đã nhận đủ cây.
        </p>
      </div>

      {handovers.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">Chưa có phiếu bàn giao nào</CardContent></Card>
      ) : (
        handovers.map((h) => {
          const total = h.proposals.reduce((s, p) => s + p.quantity, 0);
          const canConfirm = h.status === "PENDING" && (h.productionGarden.managerId === session.user.id || isAdminRole(role));
          return (
            <Card key={h.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-mono">{h.code}</CardTitle>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {h.warehouse.name} → {h.productionGarden.name} ({h.productionGarden.code}) · Tạo {format(h.createdAt, "HH:mm dd/MM/yyyy", { locale: vi })} · {total.toLocaleString("vi-VN")} cây
                    </p>
                  </div>
                  {h.status === "CONFIRMED" ? (
                    <Badge variant="completed">
                      Đã nhận{h.confirmedAt ? ` ${format(h.confirmedAt, "dd/MM/yyyy", { locale: vi })}` : ""}{h.confirmedBy ? ` — ${h.confirmedBy.name}` : ""}
                    </Badge>
                  ) : canConfirm ? (
                    <ConfirmGardenHandoverButton id={h.id} code={h.code} />
                  ) : (
                    <Badge variant="in-progress">Chờ Quản lý vườn nhận</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-divider rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Số lượng (cây)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.proposals.map((p) => (
                        <tr key={p.id} className="border-t border-divider even:bg-primary-light/30">
                          <td className="px-3 py-2 font-mono text-xs text-text-secondary">{p.plantType.code}</td>
                          <td className="px-3 py-2 text-foreground">{p.plantType.name}</td>
                          <td className="px-3 py-2 text-text-secondary">{p.stageCode}</td>
                          <td className="px-3 py-2 text-right text-foreground">{p.quantity.toLocaleString("vi-VN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
