import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CONTAMINATION_ENTRY_REASON_LABELS } from "@/types";
import type { ContaminationEntryReason } from "@prisma/client";

type Entry = {
  id: string;
  createdAt: string;
  quantity: number;
  reason: ContaminationEntryReason;
  sourceLotCode: string | null;
  reportedBy: { code: string; name: string };
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
};

// Liệt kê TỪNG LẦN báo nhiễm riêng lẻ (ContaminationRoomEntry), mới nhất lên đầu — không gộp thành 1
// dòng/mã cây như trước (Lot.enteredAt chỉ ghi ngày TẠO dòng gộp lần đầu, không phản ánh lần nhiễm mới
// nhất, khiến hoạt động hôm nay dễ bị chìm xuống cuối danh sách).
export default function ContaminationEntriesTable({ entries }: { entries: Entry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Thời gian</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
            <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Người báo</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Lý do</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Lô nguồn</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
              <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                {format(new Date(e.createdAt), "HH:mm dd/MM/yyyy", { locale: vi })}
              </td>
              <td className="px-4 py-3 font-mono text-text-secondary">{e.plantTypeCode}</td>
              <td className="px-4 py-3 text-foreground">{e.plantTypeName}</td>
              <td className="px-4 py-3"><Badge variant="secondary">{e.stageCode}</Badge></td>
              <td className={`px-4 py-3 text-right font-medium ${e.quantity < 0 ? "text-success-foreground" : "text-destructive"}`}>
                {e.quantity > 0 ? "+" : ""}{e.quantity.toLocaleString("vi-VN")}
              </td>
              <td className="px-4 py-3 text-text-secondary">
                {e.reportedBy.name} <span className="text-text-muted font-mono text-xs">({e.reportedBy.code})</span>
              </td>
              <td className="px-4 py-3"><Badge variant="outline">{CONTAMINATION_ENTRY_REASON_LABELS[e.reason] ?? e.reason}</Badge></td>
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">{e.sourceLotCode ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
