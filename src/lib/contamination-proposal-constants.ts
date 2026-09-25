// Tách riêng khỏi contamination-proposal-storage.ts (import prisma + @supabase/supabase-js, chỉ chạy
// được server-side) vì trang gửi đề xuất (client component) cần trực tiếp dùng
// CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS khi gọi compressImageToDataUrl ở trình duyệt. Y hệt
// reject-classification-constants.ts (file riêng, không dùng chung, theo đúng quy ước hiện có của repo).

// Ảnh bằng chứng Trồng/Hủy cần giữ độ nét cao (Admin đối chiếu chi tiết trước khi duyệt) — xem
// compressImageToDataUrl(file, CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS).
export const CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS = {
  targetMaxBytes: 3 * 1024 * 1024,
  hardLimitBytes: 6 * 1024 * 1024,
  dimensionSteps: [2400, 1920, 1600, 1280, 1024] as const,
};

// ~6.5MB nhị phân (base64 dài hơn ~33% bản gốc).
export const MAX_DATA_URL_LENGTH = 9_000_000;
