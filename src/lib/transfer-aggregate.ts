export type AggregatedPlantTypeRow = { code: string; name: string; t01: number; t05: number };

// Tổng hợp số lượng T01/T05 theo loại cây từ danh sách lô — dùng chung cho bảng "Tổng hợp theo loại
// cây" ở form tạo phiếu, phiếu in sau khi bàn giao, và trang xem trước (review) bàn giao sớm theo Nhóm
// tuần ra rễ.
export function aggregateLotsByPlantType(
  lots: { plantType: { id: string; code: string; name: string }; stageCode: string; quantity: number }[]
): AggregatedPlantTypeRow[] {
  const map = new Map<string, AggregatedPlantTypeRow>();
  for (const lot of lots) {
    const existing = map.get(lot.plantType.id) ?? { code: lot.plantType.code, name: lot.plantType.name, t01: 0, t05: 0 };
    if (lot.stageCode === "T01") existing.t01 += lot.quantity;
    else if (lot.stageCode === "T05") existing.t05 += lot.quantity;
    map.set(lot.plantType.id, existing);
  }
  return Array.from(map.values());
}
