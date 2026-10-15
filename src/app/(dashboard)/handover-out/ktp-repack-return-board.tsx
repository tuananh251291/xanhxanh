import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import KtpRepackReturnButton from "./ktp-repack-return-button";

// Tab "Bàn giao phiếu xử lý về Kho TP" — Phiếu xử lý Kho thành phẩm đã xử lý xong, Kho mô đã kiểm tra và xếp
// kết quả về Phòng đợi xử lý (WAITING_RETURN_HANDOVER): bấm Bàn giao → trừ lô trong phòng, chờ Kho thành
// phẩm xác nhận nhận lại (xem PATCH /api/repack-instructions/[id] returnToKtp).
export default async function KtpRepackReturnBoard({ warehouseId }: { warehouseId: string | null }) {
  if (!warehouseId) {
    return <Card><CardContent className="py-8 text-center text-text-muted">Bạn chưa được gán địa điểm làm việc.</CardContent></Card>;
  }
  const tickets = await prisma.repackInstruction.findMany({
    where: { productionWarehouseId: warehouseId, status: "WAITING_RETURN_HANDOVER" },
    orderBy: { placedAt: "asc" },
    select: {
      id: true, code: true, outputStageCode: true, confirmedPassedQuantity: true, confirmedFailedQuantity: true,
      plantType: { select: { code: true, name: true } },
      assignedTo: { select: { name: true } },
      ktpRoom: { select: { warehouse: { select: { name: true } } } },
    },
  });

  if (tickets.length === 0) {
    return <Card><CardContent className="py-12 text-center text-text-muted">Không có phiếu xử lý nào chờ bàn giao lại Kho thành phẩm</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {tickets.map((t) => {
        const passed = t.confirmedPassedQuantity ?? 0;
        const failed = t.confirmedFailedQuantity ?? 0;
        return (
          <Card key={t.id} className="border border-info-light">
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono font-medium text-info-foreground">{t.code}</p>
                <p className="text-sm text-foreground">
                  {t.plantType.code} — {t.plantType.name} {t.outputStageCode} · <b>{(passed + failed).toLocaleString("vi-VN")} cây</b> ({passed.toLocaleString("vi-VN")} đạt / {failed.toLocaleString("vi-VN")} không đạt)
                </p>
                <p className="text-xs text-text-secondary">
                  Phòng đợi xử lý{t.assignedTo ? ` · NV ${t.assignedTo.name}` : ""} → {t.ktpRoom?.warehouse.name ?? "Kho thành phẩm"}
                </p>
              </div>
              <KtpRepackReturnButton id={t.id} code={t.code} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
