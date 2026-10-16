// Nhãn/màu dùng chung cho Dự án hoa lan — KHÔNG import Prisma runtime để dùng được cả ở client component.
import type {
  OrchidOrderStatus,
  OrchidInvoiceStatus,
  OrchidPaymentMethod,
  OrchidExpenseGroup,
  OrchidRetailPointStatus,
  OrchidTransferStatus,
  OrchidTransferType,
  OrchidDamageReason,
} from "@prisma/client";

export const ORCHID_ORDER_STATUS_LABELS: Record<OrchidOrderStatus, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  WAITING_CUSTOMER: "Chờ khách xác nhận",
  CONFIRMED: "Đã xác nhận",
  PREPARING: "Đang chuẩn bị",
  SHIPPED: "Đã giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
  RETURNED: "Trả hàng",
  PARTIALLY_RETURNED: "Trả một phần",
};

export const ORCHID_ORDER_STATUS_VARIANT: Record<OrchidOrderStatus, "outline" | "info" | "in-progress" | "completed" | "overdue" | "secondary"> = {
  DRAFT: "outline",
  PENDING_APPROVAL: "in-progress",
  WAITING_CUSTOMER: "in-progress",
  CONFIRMED: "info",
  PREPARING: "info",
  SHIPPED: "secondary",
  COMPLETED: "completed",
  CANCELLED: "overdue",
  RETURNED: "overdue",
  PARTIALLY_RETURNED: "in-progress",
};

// Đơn đã giao (phát sinh công nợ, tính doanh thu).
export const ORCHID_DELIVERED_STATUSES: OrchidOrderStatus[] = ["SHIPPED", "COMPLETED", "RETURNED", "PARTIALLY_RETURNED"];
// Đơn đã chốt nhưng chưa xuất lô — giữ chỗ tồn kho.
export const ORCHID_RESERVING_STATUSES: OrchidOrderStatus[] = ["CONFIRMED"];

export const ORCHID_INVOICE_STATUS_LABELS: Record<OrchidInvoiceStatus, string> = {
  NOT_ISSUED: "Chưa xuất hoá đơn",
  PENDING: "Chờ xuất",
  ISSUED: "Đã xuất",
  SENT: "Đã gửi khách",
};
export const ORCHID_INVOICE_STATUS_VARIANT: Record<OrchidInvoiceStatus, "outline" | "in-progress" | "info" | "completed"> = {
  NOT_ISSUED: "outline",
  PENDING: "in-progress",
  ISSUED: "info",
  SENT: "completed",
};

export const ORCHID_PAYMENT_METHOD_LABELS: Record<OrchidPaymentMethod, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
};

export const ORCHID_EXPENSE_GROUP_LABELS: Record<OrchidExpenseGroup, string> = {
  MUA_HANG: "Mua hàng",
  VAN_HANH: "Vận hành",
  BAN_HANG: "Bán hàng",
  KHAC: "Khác",
};

export const ORCHID_POINT_STATUS_LABELS: Record<OrchidRetailPointStatus, string> = {
  ACTIVE: "Đang hoạt động",
  PAUSED: "Tạm dừng",
  CLOSED: "Đã đóng",
};

export const ORCHID_TRANSFER_TYPE_LABELS: Record<OrchidTransferType, string> = {
  TO_POINT: "Kho trung tâm → Điểm bán",
  FROM_POINT: "Điểm bán → Kho trung tâm",
};

export const ORCHID_TRANSFER_STATUS_LABELS: Record<OrchidTransferStatus, string> = {
  PENDING: "Chờ nhận",
  RECEIVED: "Đã nhận",
  CANCELLED: "Đã huỷ",
};

export const ORCHID_DAMAGE_REASON_LABELS: Record<OrchidDamageReason, string> = {
  VAN_CHUYEN: "Hỏng do vận chuyển",
  BENH: "Hỏng do bệnh",
  KHACH_TRA: "Hỏng do khách trả",
  KHONG_XAC_DINH: "Không xác định",
  KHAC: "Khác",
};

const vnd = new Intl.NumberFormat("vi-VN");
export function formatVND(value: number | null | undefined): string {
  return `${vnd.format(Math.round(value ?? 0))} đ`;
}
export function formatNumber(value: number | null | undefined): string {
  return vnd.format(Math.round(value ?? 0));
}
// "dd/MM/yyyy" theo giờ Việt Nam.
export function formatDateVN(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}
export function formatDateTimeVN(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// "yyyy-MM-dd" theo giờ Việt Nam — giá trị cho <input type="date">.
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Trích video id từ link YouTube (watch?v=, youtu.be/, shorts/, embed/) để nhúng iframe.
export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

// Giá theo mốc số lượng: mốc có minQuantity lớn nhất <= quantity (mốc nhỏ nhất nếu quantity dưới mọi mốc).
// Giá riêng của khách (nếu có) luôn ưu tiên. Dùng chung client (giỏ hàng) + server (tạo đơn).
export function resolveOrchidPrice(
  tiers: { minQuantity: number; price: number }[],
  quantity: number,
  customerPrice?: number | null
): number {
  if (customerPrice != null) return customerPrice;
  if (tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  let price = sorted[0].price;
  for (const t of sorted) if (quantity >= t.minQuantity) price = t.price;
  return price;
}

export function computeOrderTotals(items: { quantity: number; unitPrice: number }[], vatRate: number) {
  const subtotal = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  const vatAmount = Math.round((subtotal * vatRate) / 100);
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
