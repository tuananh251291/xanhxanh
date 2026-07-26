import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Recycle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { getFinishedQualifiedRooms } from "@/lib/processing";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import ProcessingTicketForm from "./processing-ticket-form";
import CompleteProcessingRequestButton from "./complete-processing-request-button";

export default async function ProcessingPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/processing"))) redirect("/dashboard");

  const [rooms, plantTypes, recentTickets, pendingRequests] = await Promise.all([
    getFinishedQualifiedRooms(),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.processingTicket.findMany({
      where: { createdById: session?.user?.id ?? "" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, code: true, inputStageCode: true, inputQuantity: true, outputStageCode: true, outputQuantity: true,
        notes: true, createdAt: true, plantType: { select: { code: true, name: true } },
      },
    }),
    prisma.orderProcessingRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, code: true, sourceStageCode: true, neededQuantity: true, bagSize: true, deductQuantity: true, surplusQuantity: true,
        order: { select: { code: true } }, plantType: { select: { code: true, name: true } },
        room: { select: { name: true, type: true, warehouse: { select: { name: true } } } },
        targetRoom: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Recycle className="w-6 h-6 text-primary-strong" /> Xử lý cây
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Chuyển đổi 1 lượng cây từ quy cách này sang quy cách khác trong cùng 1 Phòng đạt tiêu chuẩn — tồn kho được trừ/cộng ngay khi tạo phiếu.
        </p>
      </div>

      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Yêu cầu xử lý đơn hàng — chờ xử lý</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pendingRequests.map((r) => {
              // Nguồn không phải Phòng đạt tiêu chuẩn (Kho hàn túi/Theo dõi) — cần chuyển phòng thay vì
              // mở túi lớn hơn, xem PATCH /api/order-processing-requests/[id].
              const isRoomTransfer = r.room.type !== "PHONG_DAT_TIEU_CHUAN";
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{r.code} · Đơn {r.order.code}</p>
                    <p className="text-xs text-text-secondary">
                      {r.plantType.name} ({r.plantType.code}) · {r.room.warehouse.name} — {r.room.name} · Cần {r.neededQuantity.toLocaleString("vi-VN")} cây (túi {r.sourceStageCode}, {r.bagSize} cây/túi)
                      {isRoomTransfer
                        ? ` → chuyển ${r.deductQuantity.toLocaleString("vi-VN")} cây sang Phòng đạt tiêu chuẩn${r.targetRoom ? ` (${r.targetRoom.name})` : ""}${r.surplusQuantity > 0 ? `, dư ${r.surplusQuantity.toLocaleString("vi-VN")} cây trả về T01` : ""}`
                        : ` → mở ${r.deductQuantity.toLocaleString("vi-VN")} cây, dư ${r.surplusQuantity.toLocaleString("vi-VN")} cây trả về T01`}
                    </p>
                  </div>
                  <CompleteProcessingRequestButton
                    requestId={r.id}
                    code={r.code}
                    sourceStageCode={r.sourceStageCode}
                    neededQuantity={r.neededQuantity}
                    deductQuantity={r.deductQuantity}
                    surplusQuantity={r.surplusQuantity}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <ProcessingTicketForm rooms={rooms} plantTypes={plantTypes} />

      {recentTickets.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Phiếu gần đây của bạn</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentTickets.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-divider">
                <div>
                  <p className="text-sm font-medium text-foreground font-mono">{t.code}</p>
                  <p className="text-xs text-text-secondary">
                    {t.plantType.name} ({t.plantType.code}) · {t.inputStageCode} {t.inputQuantity.toLocaleString("vi-VN")} → {t.outputStageCode} {t.outputQuantity.toLocaleString("vi-VN")}
                    {t.notes ? ` · ${t.notes}` : ""} · {formatDistanceToNow(t.createdAt, { addSuffix: true, locale: vi })}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
