import type { UserRole } from "@prisma/client";

export type { UserRole };

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  KY_THUAT: "Nhân viên kỹ thuật",
  CAY_MO: "Nhân viên nuôi cấy mô",
  KHO_MO: "Nhân viên kho mô",
  KHO_THANH_PHAM: "Nhân viên kho thành phẩm",
  SALE: "Nhân viên sale",
  MOI_TRUONG: "Nhân viên đổ môi trường",
  DIEU_PHOI: "Nhân viên điều phối",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: "bg-red-100 text-red-800",
  KY_THUAT: "bg-purple-100 text-purple-800",
  CAY_MO: "bg-green-100 text-green-800",
  KHO_MO: "bg-blue-100 text-blue-800",
  KHO_THANH_PHAM: "bg-yellow-100 text-yellow-800",
  SALE: "bg-pink-100 text-pink-800",
  MOI_TRUONG: "bg-cyan-100 text-cyan-800",
  DIEU_PHOI: "bg-orange-100 text-orange-800",
};

export const WAREHOUSE_TYPE_LABELS = {
  PHONG_TOI: "Phòng tối",
  KHO_SANG: "Kho sáng",
  KHO_THANH_PHAM: "Kho thành phẩm",
} as const;

export const STAGE_LABELS = {
  MAU_ME: "Mẫu mẹ",
  THANH_PHAM: "Thành phẩm",
} as const;

export const LOT_STATUS_LABELS = {
  ACTIVE: "Đang lưu",
  TRANSFERRED: "Đã chuyển",
  CONTAMINATED: "Nhiễm",
  DESTROYED: "Đã hủy",
  PLANTED: "Đã trồng",
  SOLD: "Đã bán",
} as const;

export const ORDER_STATUS_LABELS = {
  DRAFT: "Nháp",
  HELD: "Đang giữ",
  CONFIRMED: "Đã xác nhận",
  SHIPPED: "Đã xuất",
  CANCELLED: "Đã hủy",
} as const;

export const INSTRUCTION_STATUS_LABELS = {
  DRAFT: "Nháp",
  ACTIVE: "Đang thực hiện",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
} as const;

export const TRANSFER_STATUS_LABELS = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Từ chối",
} as const;

export const ALERT_TYPE_LABELS = {
  CONTAMINATION_HIGH: "Tỉ lệ nhiễm cao",
  OUTPUT_DEVIATION: "Lệch sản lượng",
  ORDER_EXPIRING: "Đơn sắp hết hạn",
  ORDER_EXPIRED: "Đơn hết hạn",
  STOCK_LOW: "Tồn kho thấp",
  LOT_READY_TRANSFER: "Lô sẵn sàng bàn giao",
  ORDER_PENDING_PACK: "Đơn chờ đóng gói",
} as const;

export const ALERT_STATUS_LABELS = {
  UNREAD: "Chưa đọc",
  READ: "Đã đọc",
  RESOLVED: "Đã xử lý",
} as const;

// Nav items per role
export const ROLE_NAV: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/plant-types", label: "Loại cây", icon: "Leaf" },
    { href: "/warehouses", label: "Kho & Kệ", icon: "Warehouse" },
    { href: "/medium-types", label: "Môi trường", icon: "FlaskConical" },
    { href: "/reports", label: "Báo cáo", icon: "BarChart3" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
  ],
  KY_THUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/instructions", label: "Chỉ định cấy", icon: "ClipboardList" },
    { href: "/inventory/kho-sang", label: "Kho sáng", icon: "Sun" },
    { href: "/reports/production", label: "Báo cáo SX", icon: "BarChart3" },
  ],
  CAY_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/my-instructions", label: "Chỉ định của tôi", icon: "ClipboardList" },
    { href: "/daily-record", label: "Nhập dữ liệu cấy", icon: "PenLine" },
    { href: "/my-dark-room", label: "Phòng tối cá nhân", icon: "Moon" },
    { href: "/my-reports", label: "Báo cáo cá nhân", icon: "BarChart3" },
  ],
  KHO_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/receive", label: "Nhận bàn giao", icon: "PackageCheck" },
    { href: "/inventory/kho-sang", label: "Kho sáng", icon: "Sun" },
    { href: "/transfers/send", label: "Bàn giao mẫu mẹ", icon: "PackageOpen" },
    { href: "/transfers/finished", label: "BG thành phẩm", icon: "Package" },
    { href: "/contamination", label: "Lọc nhiễm", icon: "AlertTriangle" },
  ],
  KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/receive-finished", label: "Nhận thành phẩm", icon: "PackageCheck" },
    { href: "/inventory/thanh-pham", label: "Tồn kho TP", icon: "Package" },
    { href: "/orders/pack", label: "Sắp đơn hàng", icon: "PackageOpen" },
  ],
  SALE: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/inventory/available", label: "Xem tồn khả dụng", icon: "Package" },
    { href: "/orders", label: "Đơn hàng", icon: "ShoppingCart" },
  ],
  MOI_TRUONG: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/medium/tasks", label: "Nhiệm vụ pha MT", icon: "FlaskConical" },
  ],
  DIEU_PHOI: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/inventory/all", label: "Tồn kho tổng", icon: "Warehouse" },
    { href: "/purchase-orders", label: "Đặt hàng NCC", icon: "ShoppingBag" },
  ],
};
