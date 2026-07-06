import type { UserRole } from "@prisma/client";

export type { UserRole };

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Admin cao nhất",
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
  SUPER_ADMIN: "bg-red-200 text-red-900",
  ADMIN: "bg-red-100 text-red-800",
  KY_THUAT: "bg-purple-100 text-purple-800",
  CAY_MO: "bg-green-100 text-green-800",
  KHO_MO: "bg-blue-100 text-blue-800",
  KHO_THANH_PHAM: "bg-yellow-100 text-yellow-800",
  SALE: "bg-pink-100 text-pink-800",
  MOI_TRUONG: "bg-cyan-100 text-cyan-800",
  DIEU_PHOI: "bg-orange-100 text-orange-800",
};

// ADMIN và SUPER_ADMIN đều có full quyền trang/tính năng — chỉ khác ở quyền duyệt tài khoản mới (chỉ SUPER_ADMIN).
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export const WAREHOUSE_TYPE_LABELS = {
  SAN_XUAT: "Kho sản xuất",
  THANH_PHAM: "Kho thành phẩm",
} as const;

export const WAREHOUSE_TYPE_COLORS = {
  SAN_XUAT: "bg-blue-100 text-blue-800",
  THANH_PHAM: "bg-green-100 text-green-800",
} as const;

export const ROOM_TYPE_LABELS = {
  PHONG_MAU_ME: "Phòng mẫu mẹ",
  PHONG_RA_RE: "Phòng ra rễ",
  PHONG_TOI: "Phòng tối",
  PHONG_KHA_DUNG: "Phòng khả dụng",
  PHONG_THEO_DOI: "Phòng theo dõi",
  PHONG_HAN_TUI: "Phòng hàn túi",
  PHONG_THI_TRUONG: "Phòng thị trường",
} as const;

export const ROOM_TYPE_COLORS = {
  PHONG_MAU_ME: "bg-yellow-100 text-yellow-800",
  PHONG_RA_RE: "bg-lime-100 text-lime-800",
  PHONG_TOI: "bg-gray-800 text-white",
  PHONG_KHA_DUNG: "bg-green-100 text-green-800",
  PHONG_THEO_DOI: "bg-orange-100 text-orange-800",
  PHONG_HAN_TUI: "bg-purple-100 text-purple-800",
  PHONG_THI_TRUONG: "bg-cyan-100 text-cyan-800",
} as const;

export const STAGE_LABELS = {
  MAU_ME: "Mẫu mẹ",
  THANH_PHAM: "Thành phẩm",
} as const;

// Quy cách mẫu mẹ (cụm chồi) — gắn trên Lot.stageCode khi stage = MAU_ME
export const MOTHER_SPEC_LABELS = {
  M03: "M03 — cụm 3 chồi",
  M05: "M05 — cụm 5 chồi",
} as const;

// Quy cách đóng gói thành phẩm (túi) — gắn trên Lot.stageCode khi stage = THANH_PHAM
export const FINISHED_SPEC_LABELS = {
  T01: "T01 — túi 1 cây",
  T05: "T05 — túi 5 cây",
} as const;

// Số cây trong 1 túi theo quy cách — dùng để quy đổi số cây sang số túi (VD: T05 → chia 5)
export const FINISHED_SPEC_BAG_SIZE = {
  T01: 1,
  T05: 5,
} as const;

// Số cụm mẫu mẹ trong 1 túi mẫu mẹ theo quy cách (VD: 1 túi M05 = 5 cụm) — dùng để tính sức chứa
// kệ Phòng mẫu mẹ (giới hạn 1800 cụm/kệ), KHÔNG áp dụng cho quy cách thành phẩm (T01/T05).
export const MOTHER_SPEC_BAG_SIZE = {
  M03: 3,
  M05: 5,
} as const;

// Quy đổi số lượng (đơn vị túi) của 1 lô mẫu mẹ sang số cụm mẫu mẹ thực tế chiếm chỗ trên kệ.
// Lô không phải quy cách M03/M05 (VD: T01/T05, hoặc dữ liệu cũ không có stageCode) giữ nguyên quantity.
export function motherClusterUnits(stageCode: string | null | undefined, quantity: number): number {
  const bagSize = MOTHER_SPEC_BAG_SIZE[stageCode as keyof typeof MOTHER_SPEC_BAG_SIZE];
  return bagSize ? quantity * bagSize : quantity;
}

// Đánh dấu Transfer bàn giao "MM dư" (khi chỉ định kết thúc do hết thời gian) — dùng để PATCH
// /api/transfers/[id] nhận diện và xếp thẳng vào Kho quá hạn (planSurplusPlacement) thay vì thuật
// toán bàn giao hàng ngày thông thường (planShelfAssignments), và để UI nhận biết hiển thị đúng mô tả.
export const SURPLUS_TRANSFER_TAG = "SURPLUS_MOTHER_HANDOVER";

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
  ENDED: "Kết thúc",
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
  MEDIUM_HANDOVER_READY: "Môi trường sẵn sàng bàn giao",
  MOTHER_LOT_READY: "Mẫu mẹ đến tuổi cấy chuyển",
  MEDIUM_ORDER_CREATED: "Có đơn đặt hàng môi trường mới",
} as const;

// Nhãn trạng thái đơn đặt hàng môi trường (MediumOrder) — dựa trên confirmedAt (null/có giá trị).
export const MEDIUM_ORDER_STATUS_LABELS = {
  UNCONFIRMED: "Chưa xác nhận",
  IN_PROGRESS: "Đang thực hiện",
} as const;

// Nhãn trạng thái từng dòng-ngày (MediumOrderDay) — dựa trên handedOverAt/confirmedAt.
export const MEDIUM_ORDER_DAY_STATUS_LABELS = {
  NOT_HANDED_OVER: "Chưa bàn giao",
  HANDED_OVER: "Bàn giao / chưa xác nhận",
  CONFIRMED: "Bàn giao thành công",
} as const;

export const ALERT_STATUS_LABELS = {
  UNREAD: "Chưa đọc",
  READ: "Đã đọc",
  RESOLVED: "Đã xử lý",
} as const;

// Nguyên nhân KY_THUAT chọn khi xử lý alert lệch sản lượng (OUTPUT_DEVIATION) — bắt buộc chọn 1 trong 2.
export const DEVIATION_CAUSE_LABELS = {
  KY_THUAT_SAI: "Do nhân viên kỹ thuật ra chỉ định sai",
  CAY_MO_SAI: "Do nhân viên cấy sai",
} as const;

// Nav items per role
export const ROLE_NAV: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  SUPER_ADMIN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/plant-types", label: "Danh sách cây", icon: "Leaf" },
    { href: "/warehouses", label: "Kho & Kệ", icon: "Warehouse" },
    { href: "/medium-types", label: "Môi trường", icon: "FlaskConical" },
    { href: "/reports", label: "Báo cáo", icon: "BarChart3" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/plant-types", label: "Danh sách cây", icon: "Leaf" },
    { href: "/warehouses", label: "Kho & Kệ", icon: "Warehouse" },
    { href: "/medium-types", label: "Môi trường", icon: "FlaskConical" },
    { href: "/reports", label: "Báo cáo", icon: "BarChart3" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KY_THUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/instructions", label: "Chỉ định cấy", icon: "ClipboardList" },
    { href: "/inventory/kho-sang", label: "Phòng mẫu mẹ", icon: "Sun" },
    { href: "/mother-ready", label: "Mẫu mẹ đạt chưa chỉ định", icon: "Sprout" },
    { href: "/reports/production", label: "Báo cáo SX", icon: "BarChart3" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  CAY_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/my-instructions", label: "Chỉ định của tôi", icon: "ClipboardList" },
    { href: "/daily-record", label: "Nhập dữ liệu cấy", icon: "PenLine" },
    { href: "/my-dark-room", label: "Phòng tối cá nhân", icon: "Moon" },
    { href: "/my-reports", label: "Báo cáo cá nhân", icon: "BarChart3" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KHO_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/instructions", label: "Chỉ định cấy chưa bàn giao", icon: "ClipboardList" },
    { href: "/transfers/receive", label: "Nhận bàn giao", icon: "PackageCheck" },
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    { href: "/inventory/phong-toi", label: "Phòng tối", icon: "Moon" },
    { href: "/transfers/finished", label: "BG thành phẩm", icon: "Package" },
    { href: "/contamination", label: "Lọc nhiễm", icon: "AlertTriangle" },
    { href: "/medium-orders/receive", label: "Nhận môi trường", icon: "FlaskConical" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/receive", label: "Nhận bàn giao", icon: "PackageCheck" },
    { href: "/transfers/send", label: "Luân chuyển giữa các phòng", icon: "PackageOpen" },
    { href: "/inventory/thanh-pham", label: "Tồn kho TP", icon: "Package" },
    { href: "/orders/pack", label: "Sắp đơn hàng", icon: "PackageOpen" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  SALE: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/inventory/available", label: "Xem tồn khả dụng", icon: "Package" },
    { href: "/orders", label: "Đơn hàng", icon: "ShoppingCart" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  MOI_TRUONG: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/medium-orders", label: "Đơn đặt hàng MT", icon: "FlaskConical" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  DIEU_PHOI: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/inventory/all", label: "Tồn kho tổng", icon: "Warehouse" },
    { href: "/purchase-orders", label: "Đặt hàng NCC", icon: "ShoppingBag" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
};
