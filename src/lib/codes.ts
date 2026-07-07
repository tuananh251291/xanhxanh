import { prisma } from "@/lib/prisma";
import { getWeek, getISODay, format } from "date-fns";
import type { UserRole } from "@prisma/client";

// Tiền tố + độ dài số thứ tự cho mã nhân viên theo từng vai trò — Admin cao nhất và Admin dùng chung 1
// dãy số "AD" (cùng nhóm quản trị). VD: AD01, NVKT01, NVCM001, NVK01, NVTP01, NVS01, NVMT01, NVDP01.
const USER_CODE_FORMAT: Record<UserRole, { prefix: string; pad: number }> = {
  SUPER_ADMIN: { prefix: "AD", pad: 2 },
  ADMIN: { prefix: "AD", pad: 2 },
  KY_THUAT: { prefix: "NVKT", pad: 2 },
  CAY_MO: { prefix: "NVCM", pad: 3 },
  KHO_MO: { prefix: "NVK", pad: 2 },
  KHO_THANH_PHAM: { prefix: "NVTP", pad: 2 },
  SALE: { prefix: "NVS", pad: 2 },
  MOI_TRUONG: { prefix: "NVMT", pad: 2 },
  DIEU_PHOI: { prefix: "NVDP", pad: 2 },
};

export async function generateUserCode(role: UserRole): Promise<string> {
  const { prefix, pad } = USER_CODE_FORMAT[role];
  const rolesSharingPrefix = (Object.keys(USER_CODE_FORMAT) as UserRole[])
    .filter((r) => USER_CODE_FORMAT[r].prefix === prefix);
  const last = await prisma.user.findFirst({
    where: { role: { in: rolesSharingPrefix }, code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(pad, "0")}`;
}

// Mã chỉ định = CD + mã kho sản xuất (1 ký tự, VD "A" từ warehouse.code "SX-A") + mã giàn kệ nguồn
// (5 ký tự "R{hàng}C{cột 2 số}", VD "R4C05") + ngày tạo "ddMMyy" (6 số, VD 20/10/2026 → "201026").
// VD đầy đủ: "CDAR4C05201026". Thêm hậu tố "-2", "-3"... nếu trùng (cùng kệ, cùng ngày tạo 2 chỉ định).
export async function generateInstructionCode(params: {
  warehouseCode: string;
  shelfCode: string;
  date?: Date;
}): Promise<string> {
  const { warehouseCode, shelfCode, date = new Date() } = params;
  const warehouseLetter = warehouseCode.split("-").pop() ?? warehouseCode;
  const rackCode = shelfCode.split("-").pop() ?? shelfCode;
  const dateStr = format(date, "ddMMyy");
  const base = `CD${warehouseLetter}${rackCode}${dateStr}`;

  let candidate = base;
  let n = 1;
  while (await prisma.plantingInstruction.findFirst({ where: { code: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
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

// Mã "lô sản phẩm" — lô sinh ra khi NV cấy mô nhập dữ liệu cấy hàng ngày, tự động chuyển vào phòng tối
// cá nhân. Mã = mã chỉ định cấy + 1 ký tự cuối chạy từ 2-8 tương ứng Thứ 2 (2) đến Chủ nhật (8) của
// ngày nhập — mỗi ngày trong tuần luôn ra 1 mã riêng (không gộp chung nhiều ngày vào 1 lô như trước).
export function generateProductLotCode(instructionCode: string, date: Date = new Date()): string {
  const dayDigit = getISODay(date) + 1; // getISODay: Thứ 2 = 1 ... Chủ nhật = 7
  return `${instructionCode}${dayDigit}`;
}

export async function generateMediumOrderCode(): Promise<string> {
  const today = new Date();
  const prefix = `DHMT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.mediumOrder.findFirst({
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

// Mã đề xuất Trồng/Hủy hàng nhiễm = 1 ký tự loại ("H" Hủy / "T" Trồng) + ngày tháng năm tạo "ddMMyy"
// (VD 07/07/2026 → "H070726"). Nhiều đề xuất cùng loại, cùng ngày → thêm hậu tố "-2", "-3"... để tránh
// trùng (giống generateInstructionCode/generateLotCode).
export async function generateContaminationProposalCode(
  type: "TRONG" | "HUY",
  date: Date = new Date()
): Promise<string> {
  const base = `${type === "HUY" ? "H" : "T"}${format(date, "ddMMyy")}`;

  let candidate = base;
  let n = 1;
  while (await prisma.contaminationProposal.findFirst({ where: { code: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
