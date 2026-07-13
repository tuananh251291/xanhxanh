import { prisma } from "@/lib/prisma";
import { getWeek, getISODay, format } from "date-fns";
import type { UserRole, Prisma } from "@prisma/client";

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

// Chỉ dùng để GỢI Ý mã kế tiếp (xem /api/users/next-code) — Admin luôn nhập/sửa tay mã thật lúc tạo,
// duyệt hoặc sửa tài khoản, không còn tự động gán mã này.
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

// Mã chỉ định = CD + mã kho sản xuất (1 ký tự, VD "A" từ warehouse.code "SX-A") + phần cuối mã giàn
// kệ nguồn (sau dấu "-" cuối cùng, VD "A01C05" của kệ "SXA-PS-A01C05") + ngày tạo "ddMMyy" (6 số, VD
// 20/10/2026 → "201026"). VD đầy đủ: "CDAA01C05201026". Thêm hậu tố "-2", "-3"... nếu trùng (cùng kệ,
// cùng ngày tạo 2 chỉ định).
// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD nhập Excel hàng loạt chỉ định cấy ở
// /api/data-import/instructions) để đọc thấy cả các dòng vừa tạo trước đó trong CÙNG transaction
// (read-your-own-writes), tránh 2 dòng cùng batch (cùng kệ, cùng ngày) sinh trùng mã — giống hệt cách
// generateTransferCode đã làm.
export async function generateInstructionCode(params: {
  warehouseCode: string;
  shelfCode: string;
  date?: Date;
  client?: Prisma.TransactionClient | typeof prisma;
}): Promise<string> {
  const { warehouseCode, shelfCode, date = new Date(), client = prisma } = params;
  const warehouseLetter = warehouseCode.split("-").pop() ?? warehouseCode;
  const rackCode = shelfCode.split("-").pop() ?? shelfCode;
  const dateStr = format(date, "ddMMyy");
  const base = `CD${warehouseLetter}${rackCode}${dateStr}`;

  let candidate = base;
  let n = 1;
  while (await client.plantingInstruction.findFirst({ where: { code: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD POST /api/transfers) để tính mã kế tiếp
// dựa trên đúng state đang thấy trong transaction đó, mặc định dùng prisma singleton như trước.
export async function generateTransferCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `BG-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.transfer.findFirst({
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
// Phần "gốc" của mã lô, tách riêng khỏi generateLotCode để nơi cần tự kiểm soát va chạm mã trong 1
// transaction (VD nhập Excel hàng loạt — nhiều dòng có thể ra cùng base trước khi transaction commit,
// nên không dùng được vòng lặp kiểm tra qua prisma singleton bên dưới) vẫn tính đúng cùng công thức.
export function lotCodeBase(params: { plantTypeCode: string; staffCode: string; date?: Date }): string {
  const { plantTypeCode, staffCode, date = new Date() } = params;
  const staffNum = (staffCode.match(/\d+/)?.[0] ?? "000").slice(-3).padStart(3, "0");
  const week = String(getWeek(date, { weekStartsOn: 1 })).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${plantTypeCode}${staffNum}${week}${year}`;
}

export async function generateLotCode(params: {
  plantTypeCode: string;
  staffCode: string;
  stageCode: string;
  date?: Date;
}): Promise<string> {
  const { stageCode } = params;
  const base = lotCodeBase(params);

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

// Mã kho = tiền tố theo loại ("SX" kho sản xuất / "KTP" kho thành phẩm) + 1 chữ cái tăng dần theo thứ
// tự tạo (SX-A, SX-B, ... — riêng theo từng loại, không dùng chung dãy). Quá 26 kho cùng loại thì
// chuyển sang số ("SX-27"...) — thực tế khó xảy ra nhưng vẫn tránh lỗi ký tự ngoài A-Z.
export async function generateWarehouseCode(type: "SAN_XUAT" | "THANH_PHAM"): Promise<string> {
  const prefix = type === "SAN_XUAT" ? "SX" : "KTP";
  const letterFor = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String(i - 25));

  let index = await prisma.warehouse.count({ where: { type } });
  let candidate = `${prefix}-${letterFor(index)}`;
  while (await prisma.warehouse.findFirst({ where: { code: candidate } })) {
    index += 1;
    candidate = `${prefix}-${letterFor(index)}`;
  }
  return candidate;
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
