import { prisma } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/inventory";
import { isoWeekStringToMonday } from "@/lib/week-rotation";

// "Tuần khởi đầu" của Nhóm tuần 1 (mẫu mẹ / ra rễ) — giá trị CHUNG lưu ở SystemConfig, mỗi kho sản xuất có
// thể đặt giá trị RIÊNG (Warehouse.motherRotationStartWeek / rootingRotationStartWeek) để chạy lịch xoay vòng
// khác các kho khác. Kho chưa đặt riêng (null) dùng giá trị chung — trước đây chỉ có 1 giá trị chung nên đổi
// ở trang phòng của 1 kho là đổi luôn lịch MỌI kho (04/10/2026: đổi cho Kim Động làm lệch lịch Bát Tràng).
export type RotationKind = "MAU_ME" | "RA_RE";

export const MOTHER_ROTATION_START_WEEK_KEY = "mother_rotation_start_week";
export const ROOTING_ROTATION_START_WEEK_KEY = "rooting_rotation_start_week";
export const ROTATION_START_WEEK_KEY_BY_KIND = { MAU_ME: MOTHER_ROTATION_START_WEEK_KEY, RA_RE: ROOTING_ROTATION_START_WEEK_KEY } as const;

const toMonday = (value: string | null | undefined): Date | undefined =>
  value ? (isoWeekStringToMonday(value) ?? undefined) : undefined;

// Bảng tra tuần khởi đầu theo kho — dùng cho các màn tổng hợp NHIỀU kho cùng lúc (1 Nhóm tuần dùng chung
// cho nhiều kho, mỗi kho có thể đang ở 1 khe khác nhau).
export type RotationEpochResolver = { global: Date | undefined; byWarehouse: Map<string, Date> };

export async function getRotationEpochResolver(kind: RotationKind): Promise<RotationEpochResolver> {
  const [globalValue, warehouses] = await Promise.all([
    getSystemConfig(ROTATION_START_WEEK_KEY_BY_KIND[kind], ""),
    kind === "MAU_ME"
      ? prisma.warehouse.findMany({ where: { motherRotationStartWeek: { not: null } }, select: { id: true, motherRotationStartWeek: true } })
          .then((ws) => ws.map((w) => ({ id: w.id, value: w.motherRotationStartWeek })))
      : prisma.warehouse.findMany({ where: { rootingRotationStartWeek: { not: null } }, select: { id: true, rootingRotationStartWeek: true } })
          .then((ws) => ws.map((w) => ({ id: w.id, value: w.rootingRotationStartWeek })))
  ]);
  const byWarehouse = new Map<string, Date>();
  for (const w of warehouses) {
    const monday = toMonday(w.value);
    if (monday) byWarehouse.set(w.id, monday);
  }
  return { global: toMonday(globalValue), byWarehouse };
}

// Tuần khởi đầu áp cho 1 kho — nhận cả Date (đã tra sẵn cho đúng 1 kho, cách gọi cũ) lẫn bảng tra nhiều kho.
export function resolveRotationEpoch(input: Date | RotationEpochResolver | undefined, warehouseId?: string): Date | undefined {
  if (!input || input instanceof Date) return input;
  return (warehouseId ? input.byWarehouse.get(warehouseId) : undefined) ?? input.global;
}

// Tuần khởi đầu cho ĐÚNG 1 kho (giá trị riêng nếu có, không thì giá trị chung). Không truyền warehouseId =
// giá trị chung.
export async function getRotationEpoch(kind: RotationKind, warehouseId?: string | null): Promise<Date | undefined> {
  if (warehouseId) {
    const w = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { motherRotationStartWeek: true, rootingRotationStartWeek: true },
    });
    const own = toMonday(kind === "MAU_ME" ? w?.motherRotationStartWeek : w?.rootingRotationStartWeek);
    if (own) return own;
  }
  return toMonday(await getSystemConfig(ROTATION_START_WEEK_KEY_BY_KIND[kind], ""));
}
