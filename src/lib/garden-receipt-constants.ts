// Nhãn trạng thái phiếu bàn giao cây mô về vườn (GardenReceiptStatus) — dùng chung client/server.
export const GARDEN_RECEIPT_STATUS_LABELS = {
  PENDING: "Chờ giao kiểm đếm",
  COUNTING: "Đang kiểm đếm",
  DISCREPANCY: "Lệch số lượng",
  COMPLETED: "Đã nhận",
} as const;

// Loại lệnh sản xuất đi kèm phiếu (GardenOrderType).
export const GARDEN_ORDER_TYPE_LABELS = {
  PLANNED: "Lệnh sản xuất có kế hoạch",
  CONTAMINATED: "Lệnh sản xuất cây nhiễm",
} as const;

// Quy cách đầu ra của lệnh sản xuất tại vườn — chậu S/M/L/C (cùng mã Phòng cây trồng Kho thị trường, xem
// POT_SPEC_LABELS) + B = cây trồng trong vỉ (đầu ra mặc định của lệnh cây nhiễm).
export const GARDEN_OUTPUT_SPEC_LABELS = {
  S: "S — chậu S",
  M: "M — chậu M",
  L: "L — chậu L",
  C: "C — chậu C",
  B: "B — cây trồng trong vỉ",
} as const;
export type GardenOutputSpec = keyof typeof GARDEN_OUTPUT_SPEC_LABELS;
export const GARDEN_OUTPUT_SPECS = Object.keys(GARDEN_OUTPUT_SPEC_LABELS) as GardenOutputSpec[];
export const CONTAMINATED_OUTPUT_SPEC: GardenOutputSpec = "B";

// Phiếu ghi nhận cây hỏng (GardenDamageReport) — luồng theo loại lệnh của phiếu bàn giao ban đầu.
export const GARDEN_DAMAGE_FLOW_LABELS = {
  CONTAMINATED: "Luồng A — Phiếu ghi nhận cây nhiễm bị hỏng",
  PLANNED: "Luồng B — Phiếu ghi nhận cây khỏe bị hỏng",
} as const;
export const GARDEN_STOCK_POOL_LABELS = {
  CONTAMINATED: "Kho nhiễm",
  PLANNED: "Kho cây trồng",
} as const;
export const GARDEN_DAMAGE_STATUS_LABELS = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ QLV xác nhận",
  RETURNED: "QLV trả lại — kiểm tra lại",
  CONFIRMED: "Đã xác nhận",
} as const;
