// Nhãn trạng thái phiếu bàn giao cây mô về vườn (GardenReceiptStatus) — dùng chung client/server.
export const GARDEN_RECEIPT_STATUS_LABELS = {
  PENDING: "Chờ giao kiểm đếm",
  COUNTING: "Đang kiểm đếm",
  DISCREPANCY: "Lệch số lượng",
  COMPLETED: "Đã nhận",
} as const;
