// Dòng đơn hàng lưu mã cây + quy cách ngay trên chính nó (OrderItem.plantTypeId/stageCode), lotId để trống khi
// hàng chưa về. Dòng cũ chưa chuyển đổi dữ liệu thì lấy từ lô — mọi nơi hiển thị đọc qua đây để không phải tự xét.
export const ORDER_ITEM_SPEC_FIELDS = {
  plantTypeId: true,
  stageCode: true,
  plantType: { select: { code: true, name: true } },
} as const;

type PlantRef = { code: string; name: string };
type SpecSource = {
  plantTypeId: string | null;
  stageCode: string | null;
  plantType: PlantRef | null;
  lot: { plantTypeId: string; stageCode: string; plantType: PlantRef } | null;
};

export function orderItemSpec(item: SpecSource) {
  return {
    plantTypeId: item.plantTypeId ?? item.lot?.plantTypeId ?? "",
    stageCode: item.stageCode ?? item.lot?.stageCode ?? "",
    plantType: item.plantType ?? item.lot?.plantType ?? { code: "?", name: "" },
  };
}

// Giữ nguyên dạng `item.lot.plantType...` cho các component hiển thị đang nhận sẵn dạng này.
export function withResolvedLot<T extends SpecSource>(item: T) {
  return { ...item, lot: orderItemSpec(item) };
}
