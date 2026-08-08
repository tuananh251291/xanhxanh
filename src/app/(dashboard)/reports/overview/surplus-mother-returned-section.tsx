import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { vi } from "date-fns/locale";
import { SURPLUS_TRANSFER_TAG, TRANSFER_STATUS_LABELS } from "@/types";
import type { TransferStatus } from "@prisma/client";

const STATUS_BADGE: Record<TransferStatus, "in-progress" | "completed" | "overdue"> = {
  PENDING: "in-progress",
  CONFIRMED: "completed",
  REJECTED: "overdue",
};

// Danh sách ngắn gọn các phiếu bàn giao MẪU MẸ DƯ (NV cấy mô bàn giao khi chỉ định kết thúc, hết thời
// gian sử dụng — xem SURPLUS_TRANSFER_TAG, planSurplusPlacement ở shelf-assignment.ts) phát sinh trong
// TUẦN NÀY (Thứ 2 - Chủ nhật) — giúp KY_THUAT nắm nhanh tuần này có bao nhiêu mẫu mẹ bị dư trả lại, của
// NV nào, mã cây gì, không cần vào từng chỉ định để tra.
export default async function SurplusMotherReturnedSection() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const transfers = await prisma.transfer.findMany({
    where: { notes: SURPLUS_TRANSFER_TAG, createdAt: { gte: weekStart, lte: weekEnd } },
    include: {
      fromUser: { select: { name: true, code: true } },
      items: {
        include: { lot: { select: { stageCode: true, plantType: { select: { code: true, name: true } } } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = transfers.flatMap((t) =>
    t.items.map((item) => ({
      key: item.id,
      staffName: t.fromUser?.name ?? "—",
      staffCode: t.fromUser?.code ?? "—",
      plantTypeCode: item.lot.plantType.code,
      plantTypeName: item.lot.plantType.name,
      stageCode: item.lot.stageCode,
      quantity: item.quantity,
      createdAt: t.createdAt,
      status: t.status,
      transferCode: t.code,
    }))
  );
  const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mẫu mẹ dư được bàn giao lại — tuần này</CardTitle>
        <p className="text-sm text-text-secondary">
          {format(weekStart, "dd/MM")} – {format(weekEnd, "dd/MM")} · Tổng {totalQuantity.toLocaleString("vi-VN")} cụm
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Chưa có mẫu mẹ dư nào được bàn giao lại trong tuần này</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">NV cấy mô</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                  <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Ngày bàn giao</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-3 py-2">{r.staffName} <span className="text-text-muted font-mono text-xs">({r.staffCode})</span></td>
                    <td className="px-3 py-2 font-mono text-text-secondary">{r.plantTypeCode} <span className="text-text-muted font-sans">— {r.plantTypeName}</span></td>
                    <td className="px-3 py-2"><Badge variant="secondary">{r.stageCode}</Badge></td>
                    <td className="px-3 py-2 text-right font-medium">{r.quantity.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2 text-text-secondary">{format(r.createdAt, "dd/MM/yyyy", { locale: vi })}</td>
                    <td className="px-3 py-2"><Badge variant={STATUS_BADGE[r.status]}>{TRANSFER_STATUS_LABELS[r.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
