import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import KtpRepackReceiveForm from "./ktp-repack-receive-form";

// Tab "Nhận phiếu xử lý từ Kho TP" — Phiếu xử lý Kho thành phẩm đã bàn giao (KTP_HANDED_OVER) cho đúng khu
// sản xuất Kho mô đang làm việc: bấm Nhận → hàng thành lô trong Phòng đợi xử lý (không giàn kệ, giống phòng
// nhiễm cá nhân), chỉ định về "Chờ gán NV" ở Chỉ định cấy xử lý (xem PATCH /api/repack-instructions/[id]
// khoMoReceive).
export default async function KtpRepackReceiveBoard({ warehouseId }: { warehouseId: string | null }) {
  if (!warehouseId) {
    return <Card><CardContent className="py-8 text-center text-text-muted">Bạn chưa được gán địa điểm làm việc.</CardContent></Card>;
  }
  const [tickets, room] = await Promise.all([
    prisma.repackInstruction.findMany({
      where: { productionWarehouseId: warehouseId, status: "KTP_HANDED_OVER" },
      orderBy: { ktpHandedOverAt: "asc" },
      select: {
        id: true, code: true, ktpHandedOverAt: true, inputStageCode: true, inputQuantity: true, outputStageCode: true, notes: true,
        plantType: { select: { code: true, name: true } },
        ktpRoom: { select: { warehouse: { select: { name: true } } } },
        ktpHandedOverBy: { select: { name: true } },
      },
    }),
    prisma.room.findFirst({ where: { warehouseId, type: "PHONG_DOI_XU_LY", isActive: true }, select: { id: true } }),
  ]);

  if (tickets.length === 0) {
    return <Card><CardContent className="py-12 text-center text-text-muted">Không có phiếu xử lý nào từ Kho thành phẩm đang chờ nhận</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {!room && (
        <p className="text-sm text-destructive bg-danger-light rounded-lg p-3">
          Kho chưa có Phòng đợi xử lý — liên hệ Admin trước khi nhận.
        </p>
      )}
      {tickets.map((t) => (
        <Card key={t.id} className="border border-info-light">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono font-medium text-info-foreground">{t.code}</p>
              <p className="text-sm text-foreground">
                {t.plantType.code} — {t.plantType.name} · <b>{t.inputQuantity.toLocaleString("vi-VN")} cây</b> {t.inputStageCode} → xử lý thành {t.outputStageCode}
              </p>
              <p className="text-xs text-text-secondary">
                Từ {t.ktpRoom?.warehouse.name ?? "Kho thành phẩm"}
                {t.ktpHandedOverBy && ` · ${t.ktpHandedOverBy.name} bàn giao`}
                {t.ktpHandedOverAt && ` ${format(t.ktpHandedOverAt, "HH:mm dd/MM/yyyy", { locale: vi })}`}
                {t.notes ? ` · ${t.notes}` : ""}
              </p>
            </div>
            <KtpRepackReceiveForm id={t.id} code={t.code} disabled={!room} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
