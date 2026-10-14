// Đối chiếu tồn kho cuối tháng — phần dùng chung client/server (không import Prisma). Xem src/lib/stock-count.ts.

export const STOCK_COUNT_STATUS_LABELS = {
  DRAFT: "Đang kiểm kê",
  SUBMITTED: "Chờ Admin cấp cao xem",
  RECHECK_REQUESTED: "Yêu cầu kiểm tra lại",
  APPLIED: "Đã áp vào tồn kho",
} as const;

// Lập/sửa/gửi báo cáo: Quản lý kho thành phẩm. Xem: thêm NV Trợ lý, Admin cấp cao, Hành chính nhân sự.
// Quyết định (kiểm tra lại / áp số): chỉ Admin cấp cao.
export const canEditStockCount = (role: string | null | undefined) => role === "QUAN_LY_KHO_THANH_PHAM";
export const canDecideStockCount = (role: string | null | undefined) => role === "SUPER_ADMIN";
export const canViewStockCount = (role: string | null | undefined) =>
  canEditStockCount(role) || canDecideStockCount(role) || role === "TRO_LY" || role === "HANH_CHINH_NHAN_SU";

export const isStockCountEditable = (status: string) => status === "DRAFT" || status === "RECHECK_REQUESTED";

// Tóm tắt Phần 2 của mẫu: tổng số mã đã đối chiếu (đã nhập thực tế), số mã khớp, số mã chênh lệch.
export function summarizeStockCount(items: { systemQuantity: number; actualQuantity: number | null }[]) {
  let counted = 0, matched = 0, totalSystem = 0, totalActual = 0;
  for (const i of items) {
    totalSystem += i.systemQuantity;
    if (i.actualQuantity == null) continue;
    counted++;
    totalActual += i.actualQuantity;
    if (i.actualQuantity === i.systemQuantity) matched++;
  }
  return { total: items.length, counted, matched, mismatched: counted - matched, totalSystem, totalActual };
}
