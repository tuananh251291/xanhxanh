import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import KtpRepackHandoverActions from "./ktp-repack-handover-actions";

// "Bàn giao liên kho" của Kho thành phẩm — Phiếu xử lý Quản lý kho thành phẩm đã tạo (nhiệm vụ tuần
// "Phiếu xử lý") nằm ở đây chờ bàn giao sang khu sản xuất: bấm "Bàn giao" mới trừ Phòng chờ xử lý (xem
// PATCH /api/repack-instructions/[id] ktpHandover), rồi Kho mô khu sản xuất nhận vào Phòng đợi xử lý.
export default async function KtpHandoverOutPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(await isPageAllowed(role, "/ktp-handover-out"))) redirect("/dashboard");
  if (!isKhoThanhPhamRole(role) && !isAdminRole(role)) redirect("/dashboard");

  const warehouseId = session.user.workplaceWarehouseId;
  const tickets = await prisma.repackInstruction.findMany({
    where: {
      ktpRoomId: { not: null },
      status: { in: ["KTP_WAITING_HANDOVER", "KTP_HANDED_OVER"] },
      ...(isKhoThanhPhamRole(role) ? { ktpRoom: { warehouseId: warehouseId ?? "" } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, code: true, status: true, createdAt: true, ktpHandedOverAt: true, createdById: true,
      inputStageCode: true, inputQuantity: true, outputStageCode: true, notes: true,
      plantType: { select: { code: true, name: true } },
      productionWarehouse: { select: { name: true } },
      createdBy: { select: { name: true } },
      ktpHandedOverBy: { select: { name: true } },
    },
  });
  const waiting = tickets.filter((t) => t.status === "KTP_WAITING_HANDOVER");
  const handedOver = tickets.filter((t) => t.status === "KTP_HANDED_OVER");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Bàn giao liên kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Phiếu xử lý chờ bàn giao sang khu sản xuất — bấm Bàn giao khi đã chuyển hàng đi (trừ Phòng chờ xử lý).
          Kết quả xử lý xong nhận lại ở Nhận hàng &gt; Nhận lại phiếu xử lý.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Phiếu xử lý chờ bàn giao</h2>
        {waiting.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-text-muted">Không có phiếu xử lý nào đang chờ bàn giao</CardContent></Card>
        ) : (
          waiting.map((t) => (
            <Card key={t.id} className="border border-warning-light">
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono font-medium text-warning-foreground">{t.code}</p>
                  <p className="text-sm text-foreground">
                    {t.plantType.code} — {t.plantType.name} · <b>{t.inputQuantity.toLocaleString("vi-VN")} cây</b> {t.inputStageCode} → {t.outputStageCode}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Gửi {t.productionWarehouse?.name} · Tạo bởi {t.createdBy.name} {format(t.createdAt, "HH:mm dd/MM/yyyy", { locale: vi })}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </p>
                </div>
                <KtpRepackHandoverActions
                  id={t.id}
                  code={t.code}
                  canCancel={isAdminRole(role) || (role === "QUAN_LY_KHO_THANH_PHAM" && t.createdById === session.user.id)}
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {handedOver.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">Đã bàn giao — chờ Kho mô nhận</h2>
          {handedOver.map((t) => (
            <Card key={t.id}>
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono font-medium text-foreground">{t.code}</p>
                  <p className="text-sm text-text-secondary">
                    {t.plantType.code} — {t.plantType.name} · {t.inputQuantity.toLocaleString("vi-VN")} cây {t.inputStageCode} · {t.productionWarehouse?.name}
                    {t.ktpHandedOverAt && ` · Bàn giao ${format(t.ktpHandedOverAt, "HH:mm dd/MM/yyyy", { locale: vi })}`}
                    {t.ktpHandedOverBy && ` bởi ${t.ktpHandedOverBy.name}`}
                  </p>
                </div>
                <Badge variant="in-progress">Chờ Kho mô nhận</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
