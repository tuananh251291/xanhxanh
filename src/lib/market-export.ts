import type { Prisma } from "@prisma/client";
import { generateLotCode } from "@/lib/codes";
import { FINISHED_SPEC_BAG_SIZE } from "@/types";

// Quy cách túi (Phòng sản phẩm đạt) — luôn kiểm tra 3 mã này TRƯỚC quy cách chậu (1 ký tự) để tránh
// khớp nhầm khi Mã hàng không có dấu phân cách rõ ràng, xem parseExportStageCode.
const BAG_STAGE_CODES = ["T01", "T05", "T10"] as const;
// Quy cách chậu (Phòng cây trồng) — 1 chậu luôn tính là 1 cây, xem POT_SPEC_LABELS (src/types/index.ts).
const POT_STAGE_CODES = ["S", "M", "L", "C"] as const;

export type ExportRoomKind = "PHONG_SAN_PHAM_DAT" | "PHONG_CAY_TRONG";

// Tách quy cách (T01/T05/T10 hoặc S/M/L/C) từ cột "Mã hàng" — Mã hàng là mã sản phẩm kèm quy cách, chưa
// có quy ước dấu phân cách cố định giữa các đợt xuất nên thử theo thứ tự: (1) tách theo dấu phân cách
// thường gặp (-, _, khoảng trắng, .) lấy đoạn CUỐI; (2) nếu không có dấu phân cách, khớp hậu tố trực tiếp
// (ưu tiên mã túi 3 ký tự trước mã chậu 1 ký tự để tránh nhầm). Trả về null nếu không xác định được —
// route gọi hàm này sẽ báo lỗi rõ theo dòng để Đối tác vận hành tự sửa lại Mã hàng hoặc báo Admin kỹ thuật
// điều chỉnh lại quy tắc tách nếu định dạng thực tế khác giả định này.
export function parseExportStageCode(productCode: string): string | null {
  const code = productCode.trim().toUpperCase();
  if (!code) return null;

  const parts = code.split(/[-_.\s]+/).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart && ([...BAG_STAGE_CODES, ...POT_STAGE_CODES] as string[]).includes(lastPart)) {
    return lastPart;
  }

  for (const stageCode of BAG_STAGE_CODES) {
    if (code.endsWith(stageCode)) return stageCode;
  }
  for (const stageCode of POT_STAGE_CODES) {
    if (code.endsWith(stageCode)) return stageCode;
  }
  return null;
}

// Phòng đích ở Kho thị trường theo quy cách đã tách — túi → Phòng sản phẩm đạt, chậu → Phòng cây trồng.
export function roomKindForStageCode(stageCode: string): ExportRoomKind | null {
  if ((BAG_STAGE_CODES as readonly string[]).includes(stageCode)) return "PHONG_SAN_PHAM_DAT";
  if ((POT_STAGE_CODES as readonly string[]).includes(stageCode)) return "PHONG_CAY_TRONG";
  return null;
}

// Số CÂY thực trừ = Lineitem quantity (số túi/chậu bán) × số cây/túi — chậu luôn 1 cây/chậu (không có
// trong FINISHED_SPEC_BAG_SIZE nên mặc định 1).
export function bagSizeForStageCode(stageCode: string): number {
  return (FINISHED_SPEC_BAG_SIZE as Record<string, number>)[stageCode] ?? 1;
}

// Trừ tồn thực (Lot.quantity) theo (phòng, loại cây, quy cách) — lấy lô ACTIVE cũ nhất, CHO PHÉP âm nếu
// bán vượt tồn thực tế (đối soát lại sau, xem comment MarketExport ở schema.prisma). Chưa từng có lô nào
// ở đúng combo này thì tạo mới với quantity âm — vẫn cần 1 bản ghi Lot để giữ đúng tồn thực, không thể bỏ
// qua như trường hợp cộng dồn (upsertLot, src/lib/goods-receipt.ts).
export async function deductOrCreateLot(
  tx: Prisma.TransactionClient,
  roomId: string,
  plantTypeId: string,
  plantTypeCode: string,
  stageCode: string,
  quantity: number,
  staffCode: string
): Promise<void> {
  const existingLot = await tx.lot.findFirst({
    where: { roomId, plantTypeId, stageCode, status: "ACTIVE" },
    orderBy: { enteredAt: "asc" },
  });
  if (existingLot) {
    await tx.lot.update({ where: { id: existingLot.id }, data: { quantity: { decrement: quantity } } });
    return;
  }
  const code = await generateLotCode({ plantTypeCode, staffCode, stageCode, client: tx });
  await tx.lot.create({
    data: {
      code,
      plantTypeId,
      stage: "THANH_PHAM",
      stageCode,
      roomId,
      quantity: -quantity,
      initialQuantity: -quantity,
      status: "ACTIVE",
    },
  });
}
