import { z } from "zod";

const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

export const orchidProductSchema = z.object({
  code: optText(40),
  name: z.string().trim().min(1, "Nhập tên sản phẩm"),
  imageUrls: z.array(z.string().url()).max(12),
  youtubeUrl: optText(300),
  description: z.string().max(10000).optional().nullable(),
  unit: z.string().trim().min(1).max(20).default("cây"),
  supplierId: z.string().optional().nullable(),
  note: z.string().max(5000).optional().nullable(),
  showToCustomer: z.boolean(),
  showStock: z.boolean(),
  isActive: z.boolean().default(true),
  priceTiers: z
    .array(z.object({ minQuantity: z.number().int().min(1), price: z.number().min(0) }))
    .min(1, "Cần ít nhất 1 mốc giá")
    .refine((t) => new Set(t.map((x) => x.minQuantity)).size === t.length, "Các mốc số lượng không được trùng nhau"),
});

export const orchidSupplierSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên nhà cung cấp"),
  contactName: optText(200),
  phone: optText(50),
  address: optText(500),
  paymentTermDays: z.number().int().min(0).max(365),
  note: z.string().max(5000).optional().nullable(),
});

export const orchidCustomerSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên khách hàng"),
  phone: optText(50),
  email: optText(200),
  address: optText(500),
  creditLimit: z.number().min(0).nullable(),
  paymentTermDays: z.number().int().min(0).max(365),
  companyName: optText(300),
  taxCode: optText(50),
  invoiceAddress: optText(500),
  invoiceEmail: optText(200),
  note: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().default(true),
  // Tài khoản đăng nhập (tuỳ chọn) — loginEmail + loginPassword khi tạo mới; sửa: để trống mật khẩu = giữ nguyên.
  loginEmail: z.union([z.string().trim().email("Email đăng nhập không hợp lệ"), z.literal("")]).optional().nullable(),
  loginPassword: optText(100),
  prices: z.array(z.object({ productId: z.string(), price: z.number().min(0) })).optional(),
});

export const orchidReceiptSchema = z.object({
  supplierId: z.string().optional().nullable(),
  warehouseId: z.string().min(1, "Chọn kho nhập"),
  receiptDate: dateStr,
  dueDate: dateStr.optional().nullable().or(z.literal("")),
  otherCost: z.number().min(0).default(0),
  note: z.string().max(5000).optional().nullable(),
  lines: z
    .array(z.object({ productId: z.string().min(1, "Chọn sản phẩm"), quantity: z.number().int().min(1), unitCost: z.number().min(0), note: optText(500) }))
    .min(1, "Phiếu nhập cần ít nhất 1 dòng"),
});

export const orchidOrderLineSchema = z.object({
  productId: z.string().min(1, "Chọn sản phẩm"),
  quantity: z.number().int().min(1, "Số lượng tối thiểu 1"),
  unitPrice: z.number().min(0).optional(),
});

export const orchidOrderSchema = z.object({
  customerId: z.string().min(1, "Chọn khách hàng"),
  shippingAddress: optText(500),
  phone: optText(50),
  note: z.string().max(5000).optional().nullable(),
  internalNote: z.string().max(5000).optional().nullable(),
  needInvoice: z.boolean(),
  vatRate: z.number().min(0).max(100),
  invoiceCompanyName: optText(300),
  invoiceTaxCode: optText(50),
  invoiceAddress: optText(500),
  invoiceEmail: optText(200),
  items: z.array(orchidOrderLineSchema).min(1, "Đơn hàng cần ít nhất 1 sản phẩm"),
  // true = chốt luôn (CONFIRMED), false = lưu nháp.
  confirm: z.boolean().default(false),
});

export const orchidShopOrderSchema = z.object({
  shippingAddress: z.string().trim().min(1, "Nhập địa chỉ giao hàng").max(500),
  phone: z.string().trim().min(1, "Nhập số điện thoại").max(50),
  note: z.string().max(5000).optional().nullable(),
  needInvoice: z.boolean(),
  invoiceCompanyName: optText(300),
  invoiceTaxCode: optText(50),
  invoiceAddress: optText(500),
  invoiceEmail: optText(200),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })).min(1, "Giỏ hàng trống"),
});

export const orchidPaymentSchema = z.object({
  kind: z.enum(["customer", "supplier", "point"]),
  targetId: z.string().min(1),
  docId: z.string().optional().nullable(), // orderId / receiptId
  paymentDate: dateStr,
  amount: z.number().positive("Số tiền phải lớn hơn 0"),
  method: z.enum(["CASH", "BANK_TRANSFER"]),
  accountId: z.string().optional().nullable(),
  note: optText(500),
});

export const orchidExpenseSchema = z.object({
  expenseDate: dateStr,
  categoryId: z.string().min(1, "Chọn loại chi"),
  amount: z.number().positive("Số tiền phải lớn hơn 0"),
  recipient: optText(200),
  method: z.enum(["CASH", "BANK_TRANSFER"]),
  accountId: z.string().optional().nullable(),
  content: z.string().max(5000).optional().nullable(),
});

export const orchidPointSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên điểm bán"),
  address: optText(500),
  managerName: optText(200),
  phone: optText(50),
  startDate: dateStr.optional().nullable().or(z.literal("")),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]),
  note: z.string().max(5000).optional().nullable(),
  loginEmail: z.union([z.string().trim().email("Email đăng nhập không hợp lệ"), z.literal("")]).optional().nullable(),
  loginPassword: optText(100),
});

export const orchidTransferSchema = z.object({
  type: z.enum(["TO_POINT", "FROM_POINT"]),
  pointId: z.string().min(1, "Chọn điểm bán"),
  warehouseId: z.string().optional().nullable(),
  transferDate: dateStr,
  deliveredBy: optText(200),
  receivedBy: optText(200),
  note: z.string().max(5000).optional().nullable(),
  items: z.array(z.object({ productId: z.string().min(1, "Chọn sản phẩm"), quantity: z.number().int().min(1) })).min(1, "Cần ít nhất 1 dòng hàng"),
});

export const orchidPointEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sale"), date: dateStr, quantity: z.number().int().min(1), revenue: z.number().min(0), invoiceNumber: optText(100), note: optText(500) }),
  z.object({
    kind: z.literal("damage"),
    date: dateStr,
    quantity: z.number().int().min(1),
    reason: z.enum(["VAN_CHUYEN", "BENH", "KHACH_TRA", "KHONG_XAC_DINH", "KHAC"]),
    photoUrls: z.array(z.string().url()).max(6).default([]),
    note: optText(500),
  }),
  z.object({ kind: z.literal("stock"), date: dateStr, remainingQuantity: z.number().int().min(0), note: optText(500) }),
]);

const settingText = z.string().trim().max(300).optional().nullable();
export const orchidAccountSettingSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên tài khoản"),
  type: z.enum(["CASH", "BANK_TRANSFER"]),
  bankName: settingText,
  accountNumber: settingText,
  accountHolder: settingText,
  note: settingText,
  isActive: z.boolean().default(true),
});
export const orchidWarehouseSettingSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã kho").max(30),
  name: z.string().trim().min(1, "Nhập tên kho"),
  address: settingText,
  isActive: z.boolean().default(true),
});
export const orchidCategorySettingSchema = z.object({
  group: z.enum(["MUA_HANG", "VAN_HANH", "BAN_HANG", "KHAC"]),
  name: z.string().trim().min(1, "Nhập tên loại chi"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
