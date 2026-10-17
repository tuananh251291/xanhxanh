// 5 loại lỗi chất lượng dùng chung cho "Trả hàng nhà cung cấp" (ReturnInspectionTable, GoodsReceiptItem.
// returnDefectQuantities) và đánh giá chất lượng lúc Kho thành phẩm nhận bàn giao thành phẩm từ Phòng ra rễ
// (TransferReceiveBoard, TransferQualityCheck.defectQuantities). Thứ tự mảng số lượng = thứ tự nhãn dưới đây.
// File thuần (không import prisma) — client component import trực tiếp được.
export const QUALITY_DEFECT_LABELS = [
  "Nhiễm",
  "Vàng lá, cháy lá, thối lá",
  "Cây không đạt tiêu chuẩn về kích thước",
  "Cây full xanh, full var",
  "Cây có cụm chồi",
] as const;

export const QUALITY_DEFECT_COUNT = QUALITY_DEFECT_LABELS.length;

export const emptyDefects = (): number[] => Array.from({ length: QUALITY_DEFECT_COUNT }, () => 0);

export const sumDefects = (defects: number[]) => defects.reduce((s, n) => s + n, 0);
