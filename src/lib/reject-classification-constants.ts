// Tách riêng khỏi reject-classification-storage.ts (import prisma + @supabase/supabase-js, chỉ chạy
// được server-side) vì trang phân loại (client component) cần trực tiếp dùng
// REJECT_CLASSIFICATION_COMPRESS_OPTIONS khi gọi compressImageToDataUrl ở trình duyệt.

// Ảnh bằng chứng hàng không đạt cần giữ độ nét cao hơn ảnh định kì/thử nghiệm (kỹ thuật cần đối chiếu
// chi tiết lỗi) — xem compressImageToDataUrl(file, REJECT_CLASSIFICATION_COMPRESS_OPTIONS).
export const REJECT_CLASSIFICATION_COMPRESS_OPTIONS = {
  targetMaxBytes: 3 * 1024 * 1024,
  hardLimitBytes: 6 * 1024 * 1024,
  dimensionSteps: [2400, 1920, 1600, 1280, 1024] as const,
};

// ~6.5MB nhị phân (base64 dài hơn ~33% bản gốc) — cao hơn hẳn mức 3MB dùng cho mother/trial photos theo
// đúng yêu cầu "để dung lượng ảnh cao" của tính năng này.
export const MAX_DATA_URL_LENGTH = 9_000_000;
