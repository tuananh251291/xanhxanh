import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, MARKET_LABELS } from "@/types";

export type OrderDetailItem = {
  id: string;
  plantTypeId: string;
  plantTypeName: string;
  plantTypeCode: string;
  stageCode: string;
  quantity: number;
  notes: string | null;
  processingStatus: "PENDING" | "COMPLETED" | "CANCELLED" | null;
};

type StageBreakdown = {
  stageCode: string;
  quantity: number;
  notes: string[];
  hasPending: boolean;
  hasCompleted: boolean;
};

type PlantTypeGroup = {
  plantTypeId: string;
  plantTypeName: string;
  plantTypeCode: string;
  totalQuantity: number;
  primary: StageBreakdown;
  alternatives: StageBreakdown[];
};

// Đơn đã giữ chỉ còn OrderItem gắn thẳng vào lô cụ thể — không còn lưu lại "quy cách khách yêu cầu ban
// đầu" so với "quy cách thay thế đã chấp nhận" (2 khái niệm đó chỉ tồn tại lúc Check ở order-check-form).
// Suy luận lại: quy cách có tổng số lượng lớn nhất trong 1 loại cây là quy cách chính (nhu cầu), các quy
// cách còn lại hiển thị như đề xuất thay thế đã dùng để bù đủ đơn.
function groupByPlantType(items: OrderDetailItem[]): PlantTypeGroup[] {
  const byPlantType = new Map<string, OrderDetailItem[]>();
  for (const item of items) {
    const list = byPlantType.get(item.plantTypeId) ?? [];
    list.push(item);
    byPlantType.set(item.plantTypeId, list);
  }

  return Array.from(byPlantType.values()).map((groupItems) => {
    const byStage = new Map<string, StageBreakdown>();
    for (const item of groupItems) {
      const stage = byStage.get(item.stageCode) ?? {
        stageCode: item.stageCode, quantity: 0, notes: [], hasPending: false, hasCompleted: false,
      };
      stage.quantity += item.quantity;
      if (item.notes) stage.notes.push(item.notes);
      if (item.processingStatus === "PENDING") stage.hasPending = true;
      if (item.processingStatus === "COMPLETED") stage.hasCompleted = true;
      byStage.set(item.stageCode, stage);
    }
    const stages = Array.from(byStage.values()).sort((a, b) => b.quantity - a.quantity);
    const [primary, ...alternatives] = stages;
    return {
      plantTypeId: groupItems[0].plantTypeId,
      plantTypeName: groupItems[0].plantTypeName,
      plantTypeCode: groupItems[0].plantTypeCode,
      totalQuantity: groupItems.reduce((s, i) => s + i.quantity, 0),
      primary,
      alternatives,
    };
  });
}

function StageRow({
  stage, label, isAlternative,
}: {
  stage: StageBreakdown;
  label: string;
  isAlternative: boolean;
}) {
  return (
    <tr className={isAlternative ? "bg-background" : "border-t border-divider"}>
      <td className={`px-3 py-1.5 text-sm ${isAlternative ? "pl-8 text-text-secondary" : "text-foreground"}`}>
        {isAlternative ? <span className="text-xs">Đề xuất thay thế</span> : <span className="font-semibold">{label}</span>}
        {" · "}Quy cách {stage.stageCode}
        {stage.hasPending && <Badge variant="in-progress" className="ml-1.5">chờ tách túi</Badge>}
        {stage.hasCompleted && <Badge variant="completed" className="ml-1.5">đã tách túi</Badge>}
        {stage.notes.length > 0 && <p className="text-xs text-text-muted mt-0.5">{stage.notes.join("; ")}</p>}
      </td>
      <td className={`px-3 py-1.5 text-sm text-right ${isAlternative ? "text-text-secondary" : "font-semibold text-foreground"}`}>
        {stage.quantity.toLocaleString("vi-VN")}
      </td>
    </tr>
  );
}

// Phần nội dung chi tiết đơn hàng dùng chung — OrderDetailDialog (popup, đơn tạm giữ) bọc trong Dialog,
// /orders/list/[id] (trang riêng, đơn đã xác nhận — nội dung có thể dài nên không phù hợp popup nữa) bọc
// trong Card. Tách riêng để không lặp lại groupByPlantType/StageRow ở 2 nơi.
export default function OrderDetailContent({
  customerCode, market, status, holdUntilLabel, createdAtLabel, notes, items,
}: {
  customerCode: string;
  market: keyof typeof MARKET_LABELS;
  status: keyof typeof ORDER_STATUS_LABELS;
  holdUntilLabel: string;
  createdAtLabel: string;
  notes: string | null;
  items: OrderDetailItem[];
}) {
  const groups = groupByPlantType(items);
  const grandTotal = groups.reduce((s, g) => s + g.totalQuantity, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-text-secondary">
        <p>Khách hàng: <span className="text-foreground">{customerCode}</span></p>
        <p>Thị trường: <span className="text-foreground">{MARKET_LABELS[market]}</span></p>
        <p>Ngày tạo: <span className="text-foreground">{createdAtLabel}</span></p>
        <p>Hết hạn tạm giữ: <span className="text-foreground">{holdUntilLabel}</span></p>
        <p className="col-span-2 flex items-center gap-1.5">
          Trạng thái: <Badge className={ORDER_STATUS_COLORS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
        </p>
        {notes && <p className="col-span-2">Ghi chú: <span className="text-foreground">{notes}</span></p>}
      </div>

      <div className="border border-divider rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-light">
              <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Loại cây / Quy cách</th>
              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-32">Nhu cầu</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.plantTypeId}>
                <StageRow stage={g.primary} label={`${g.plantTypeName} (${g.plantTypeCode})`} isAlternative={false} />
                {g.alternatives.map((alt) => (
                  <StageRow key={alt.stageCode} stage={alt} label="" isAlternative />
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-divider bg-primary-light/40">
              <td className="px-3 py-2 text-sm text-right font-bold text-primary-strong">Tổng số lượng cây</td>
              <td className="px-3 py-2 text-sm text-right font-bold text-primary-strong">
                {grandTotal.toLocaleString("vi-VN")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
