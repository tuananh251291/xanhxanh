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
  QUAN_LY_KHO_THANH_PHAM: { prefix: "QLTP", pad: 2 },
  SALE: { prefix: "NVS", pad: 2 },
  MOI_TRUONG: { prefix: "NVMT", pad: 2 },
  DIEU_PHOI: { prefix: "NVDP", pad: 2 },
  HANH_CHINH_NHAN_SU: { prefix: "NVHC", pad: 2 },
  NHAN_VIEN_SAN_XUAT: { prefix: "NVSX", pad: 2 },
  NHAN_VIEN_QUAN_LY_VUON: { prefix: "NVQLV", pad: 2 },
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

// Mã chỉ định cấy xử lý = CX + mã kho sản xuất (1 ký tự) + phần cuối mã giàn kệ NGUỒN (Phòng ra rễ) +
// ngày tạo "ddMMyy" — cùng công thức generateInstructionCode nhưng tiền tố "CX" để không trùng "CD"
// (PlantingInstruction) hay "XL" (ProcessingTicket, feature khác hẳn — xem RepackInstruction ở schema).
export async function generateRepackInstructionCode(params: {
  warehouseCode: string;
  shelfCode: string;
  date?: Date;
  client?: Prisma.TransactionClient | typeof prisma;
}): Promise<string> {
  const { warehouseCode, shelfCode, date = new Date(), client = prisma } = params;
  const warehouseLetter = warehouseCode.split("-").pop() ?? warehouseCode;
  const rackCode = shelfCode.split("-").pop() ?? shelfCode;
  const dateStr = format(date, "ddMMyy");
  const base = `CX${warehouseLetter}${rackCode}${dateStr}`;

  let candidate = base;
  let n = 1;
  while (await client.repackInstruction.findFirst({ where: { code: candidate } })) {
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
// toàn app). NHIỀU dòng Lot (khác stageCode, VD M05 và T05 của cùng 1 đợt cấy) có thể dùng chung 1 mã lô
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

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction tạo NHIỀU lô cùng lúc (VD nhập kho thủ công
// theo lô — src/app/api/inventory/stock-in/route.ts) để đọc thấy cả các dòng vừa tạo trước đó trong CÙNG
// transaction (read-your-own-writes), giống hệt cách generateTransferCode/generateOrderCode đã làm —
// thiếu bước này từng gây lỗi P2002 "Unique constraint failed on (code, stageCode)" thật: 2 dòng cùng 1
// lần nhập, cùng mã cây/NV/tuần (nên cùng base) nhưng khác ngày, đều rơi vào nhánh tạo lô mới trong cùng
// 1 transaction — vòng lặp kiểm tra trùng qua prisma singleton (đọc committed-only) không thấy dòng kia
// vừa insert (chưa commit), tính ra cùng 1 candidate rồi cùng insert → vi phạm unique constraint thật.
export async function generateLotCode(params: {
  plantTypeCode: string;
  staffCode: string;
  stageCode: string;
  date?: Date;
  client?: Prisma.TransactionClient | typeof prisma;
}): Promise<string> {
  const { stageCode, client = prisma } = params;
  const base = lotCodeBase(params);

  // Cùng mã lô (base) có thể đã tồn tại cho quy cách khác (VD M05 đã tạo trước, giờ tạo dòng T05) — vẫn
  // dùng lại đúng base đó. Chỉ khi (base, stageCode) này đã tồn tại rồi (VD lô cũ đã chuyển kệ, giờ tạo
  // lô mới cùng tuần/NV/quy cách) mới thêm hậu tố để tránh trùng.
  let candidate = base;
  let n = 1;
  while (await client.lot.findFirst({ where: { code: candidate, stageCode } })) {
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

// Mã nhà cung cấp = "NCC" + số thứ tự 2 chữ số, chạy NCC01 - NCC99 (tối đa 99 nhà cung cấp). Tìm ô
// trống nhỏ nhất thay vì chỉ +1 từ mã lớn nhất, để mã của nhà cung cấp đã xóa cứng được cấp lại cho
// nhà cung cấp mới thay vì bỏ trống vĩnh viễn.
export async function generateSupplierCode(): Promise<string> {
  for (let n = 1; n <= 99; n++) {
    const candidate = `NCC${String(n).padStart(2, "0")}`;
    const existing = await prisma.supplier.findUnique({ where: { code: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Đã đạt giới hạn 99 nhà cung cấp (NCC01-NCC99)");
}

// Mã Vườn sản xuất = "VSX" + số thứ tự 2 chữ số, chạy VSX01-VSX99 — tìm ô trống nhỏ nhất, giống hệt
// generateSupplierCode.
export async function generateProductionGardenCode(): Promise<string> {
  for (let n = 1; n <= 99; n++) {
    const candidate = `VSX${String(n).padStart(2, "0")}`;
    const existing = await prisma.productionGarden.findUnique({ where: { code: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Đã đạt giới hạn 99 Vườn sản xuất (VSX01-VSX99)");
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

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD POST /api/orders tạo đơn "Tạm giữ") để
// tính mã kế tiếp dựa trên đúng state đang thấy trong transaction đó, mặc định dùng prisma singleton.
export async function generateOrderCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `DHKT-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.order.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// Mã khách hàng = "KH" + số thứ tự 5 chữ số, tự sinh lúc tạo (không cho nhập/sửa tay, khác generateUserCode
// vốn chỉ gợi ý). client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD nhập Excel hàng loạt) để
// tính mã kế tiếp dựa trên đúng state đang thấy trong transaction đó, tránh trùng mã khi tạo nhiều khách
// cùng lúc trong 1 transaction (xem generateLotCode ở trên).
export async function generateCustomerCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const prefix = "KH";
  const last = await client.customer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD POST /api/processing-tickets) để tính mã
// kế tiếp dựa trên đúng state đang thấy trong transaction đó, mặc định dùng prisma singleton.
export async function generateProcessingTicketCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `XL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.processingTicket.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD PATCH /api/orders/[id] lúc xác nhận đơn)
// để tính mã kế tiếp dựa trên đúng state đang thấy trong transaction đó, mặc định dùng prisma singleton.
export async function generateOrderProcessingRequestCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `YC-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.orderProcessingRequest.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// Mã đơn môi trường phát sinh cho đơn xử lý (ProcessingMediumOrder, xem PATCH /api/orders/[id]
// action=confirm) — tiền tố "DHMTXL" để không trùng "DHMT..." (không dùng, MediumOrder dùng prefix riêng
// "DHMT-YYYYMM") hay bất kỳ mã nào khác. client tuỳ chọn — truyền tx khi gọi trong 1 transaction để tính
// mã kế tiếp dựa trên đúng state đang thấy trong transaction đó (nhiều dòng cùng đơn hàng có thể tạo
// nhiều ProcessingMediumOrder trong CÙNG 1 transaction — cần read-your-own-writes, giống generateLotCode).
export async function generateProcessingMediumOrderCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `DHMTXL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.processingMediumOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (POST /api/goods-receipts) để tính mã kế tiếp
// dựa trên đúng state đang thấy trong transaction đó, mặc định dùng prisma singleton.
export async function generateGoodsReceiptCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `NH-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.goodsReceipt.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// client tuỳ chọn — truyền tx khi gọi trong 1 transaction (VD tạo nhiều DailyTask cùng lúc khi Quản lý
// chọn nhiều Loại cây 1 lượt) để đọc thấy cả các dòng vừa tạo trước đó trong CÙNG transaction
// (read-your-own-writes), giống hệt generateTransferCode/generateOrderCode.
export async function generateDailyTaskCode(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const today = new Date();
  const prefix = `CV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const last = await client.dailyTask.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });
  const seq = last ? parseInt(last.code.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// Mã đề xuất Trồng/Hủy hàng nhiễm = 1 ký tự loại ("H" Hủy / "T" Trồng) + ngày tháng năm tạo "ddMMyy"
// (VD 07/07/2026 → "H070726"). Nhiều đề xuất cùng loại, cùng ngày → thêm hậu tố "-2", "-3"... để tránh
// trùng (giống generateInstructionCode/generateLotCode). client tuỳ chọn — LUÔN truyền tx khi gọi hàm
// này NHIỀU LẦN cùng loại trong CÙNG 1 transaction (VD "Gộp phiếu" tạo nhiều đề xuất Hủy khác mã cây/quy
// cách 1 lượt) để đọc thấy cả các dòng vừa tạo trước đó trong CÙNG transaction (read-your-own-writes) —
// thiếu bước này từng gây lỗi P2002 "Unique constraint failed on (code)" thật: 2 đề xuất cùng loại, cùng
// ngày, tạo trong cùng 1 transaction đều tính ra cùng 1 candidate (do prisma singleton chỉ đọc committed)
// rồi cùng insert.
//
// 1 QUERY duy nhất (findMany startsWith + tính max hậu tố) thay vì dò tuần tự "-2", "-3"... từng số 1 —
// bản cũ mỗi lần gọi tốn N query (N = số đề xuất CÙNG loại/CÙNG ngày đã có), "Gộp phiếu" nhiều dòng mã
// cây trong 1 transaction dồn lại dễ vượt timeout mặc định 5s của Prisma interactive transaction (lỗi
// thật: "A query cannot be executed on an expired transaction" khi kho đã có sẵn nhiều phiếu trong ngày).
export async function generateContaminationProposalCode(
  type: "TRONG" | "HUY",
  date: Date = new Date(),
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  const base = `${type === "HUY" ? "H" : "T"}${format(date, "ddMMyy")}`;
  const existing = await client.contaminationProposal.findMany({ where: { code: { startsWith: base } }, select: { code: true } });
  return nextCodeWithSuffix(base, existing.map((e) => e.code));
}

// Từ danh sách mã ĐÃ có cùng tiền tố `base` (VD "H070726"), tính mã tiếp theo — hậu tố lớn nhất hiện có
// ("-2", "-3"...) + 1, hoặc chính `base` nếu chưa có mã nào. Dùng chung cho mọi hàm sinh mã kiểu
// "base" + "-n" (contamination proposal, bàn giao cây trồng...) — thay vòng lặp dò tuần tự bằng đúng 1
// query truy vấn danh sách mã đã có rồi tính hậu tố tại chỗ.
function nextCodeWithSuffix(base: string, existingCodes: string[]): string {
  let maxN = 0;
  for (const code of existingCodes) {
    if (code === base) maxN = Math.max(maxN, 1);
    else {
      const match = code.startsWith(`${base}-`) ? code.slice(base.length + 1).match(/^\d+$/) : null;
      if (match) maxN = Math.max(maxN, parseInt(match[0], 10));
    }
  }
  return maxN === 0 ? base : `${base}-${maxN + 1}`;
}

// Mã phiếu "Bàn giao cây trồng" = "BGCT" + ngày tháng năm tạo "ddMMyy" — nhiều phiếu cùng ngày → thêm
// hậu tố "-2", "-3"... để tránh trùng (giống generateContaminationProposalCode, dùng chung
// nextCodeWithSuffix — 1 query thay vì dò tuần tự từng số).
export async function generateReplantHandoverCode(date: Date = new Date()): Promise<string> {
  const base = `BGCT${format(date, "ddMMyy")}`;
  const existing = await prisma.replantHandover.findMany({ where: { code: { startsWith: base } }, select: { code: true } });
  return nextCodeWithSuffix(base, existing.map((e) => e.code));
}
