// Tách riêng khỏi violation-photo-storage.ts (server-only) vì form ghi lỗi (client component) cần dùng
// trực tiếp khi gọi compressImageToDataUrl — theo đúng quy ước *-constants.ts hiện có của repo.

// Ảnh bằng chứng lỗi vi phạm chỉ cần đủ nhìn rõ lỗi và chỉ giữ 14 ngày — nén mạnh hơn ảnh đề xuất
// Trồng/Hủy để tiết kiệm dung lượng/băng thông (~300KB/ảnh).
export const VIOLATION_PHOTO_COMPRESS_OPTIONS = {
  targetMaxBytes: 300 * 1024,
  hardLimitBytes: 800 * 1024,
  dimensionSteps: [1280, 1024, 800] as const,
};

export const MAX_VIOLATION_PHOTOS = 3;

// ~1MB nhị phân (base64 dài hơn ~33% bản gốc) — chặn ảnh chưa nén gửi thẳng lên API.
export const MAX_VIOLATION_PHOTO_DATA_URL_LENGTH = 1_400_000;

export const VIOLATION_PHOTO_RETENTION_DAYS = 14;
