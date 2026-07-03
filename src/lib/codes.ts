import { prisma } from "@/lib/prisma";
import { getWeek } from "date-fns";

export async function generateInstructionCode(): Promise<string> {
  const today = new Date();
  const prefix = `CI-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.plantingInstruction.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function generateTransferCode(): Promise<string> {
  const today = new Date();
  const prefix = `BG-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.transfer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// Mã lô = mã cây (VD "AL001") + mã NV cấy 3 số (VD "003", lấy từ 3 số cuối User.code "NV003") + mã
// tuần/năm 4 số (VD "0726" = tuần 07 năm 2026, tính theo lịch tuần làm việc weekStartsOn: 1 dùng chung
// toàn app). NHIỀU dòng Lot (khác stageCode, VD M03 và M05 của cùng 1 đợt cấy) có thể dùng chung 1 mã lô
// — duy nhất theo (code, stageCode), không unique theo code riêng lẻ (xem @@unique trên model Lot).
export async function generateLotCode(params: {
  plantTypeCode: string;
  staffCode: string;
  stageCode: string;
  date?: Date;
}): Promise<string> {
  const { plantTypeCode, staffCode, stageCode, date = new Date() } = params;
  const staffNum = (staffCode.match(/\d+/)?.[0] ?? "000").slice(-3).padStart(3, "0");
  const week = String(getWeek(date, { weekStartsOn: 1 })).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const base = `${plantTypeCode}${staffNum}${week}${year}`;

  // Cùng mã lô (base) có thể đã tồn tại cho quy cách khác (VD M03 đã tạo trước, giờ tạo dòng M05) — vẫn
  // dùng lại đúng base đó. Chỉ khi (base, stageCode) này đã tồn tại rồi (VD lô cũ đã chuyển kệ, giờ tạo
  // lô mới cùng tuần/NV/quy cách) mới thêm hậu tố để tránh trùng.
  let candidate = base;
  let n = 1;
  while (await prisma.lot.findFirst({ where: { code: candidate, stageCode } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export async function generateMediumHandoverCode(): Promise<string> {
  const today = new Date();
  const prefix = `BGM-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.mediumHandover.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function generateOrderCode(): Promise<string> {
  const today = new Date();
  const prefix = `DH-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.order.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}
