// Dùng chung client + server cho phản hồi khách hàng về đơn hàng đã xuất (xem src/lib/order-feedback.ts).

export const MAX_ORDER_FEEDBACK_PHOTOS = 5;

// Ảnh khách gửi (qua Zalo/Messenger...) — nén ở client trước khi gửi, ~400KB/ảnh, đủ nhìn rõ lỗi.
export const ORDER_FEEDBACK_COMPRESS_OPTIONS = {
  targetMaxBytes: 400 * 1024,
  hardLimitBytes: 900 * 1024,
  dimensionSteps: [1600, 1280, 1024, 800] as const,
};
// ~1MB nhị phân (base64 dài hơn ~33%) — chặn ảnh chưa nén gửi thẳng lên API.
export const MAX_ORDER_FEEDBACK_PHOTO_DATA_URL_LENGTH = 1_400_000;

// Dưới 5 sao = đơn hàng có lỗi (báo Admin kỹ thuật + QL Kho TP, cần xác nhận nguyên nhân).
export const isDefectRating = (rating: number) => rating < 5;

export type OrderFeedbackCauseValue = "FINISHED_WAREHOUSE" | "PRODUCTION";
export const ORDER_FEEDBACK_CAUSE_LABELS: Record<OrderFeedbackCauseValue, string> = {
  FINISHED_WAREHOUSE: "Lỗi do Kho thành phẩm",
  PRODUCTION: "Lỗi do phòng sản xuất",
};
