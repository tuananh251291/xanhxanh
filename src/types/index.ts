import type { UserRole } from "@prisma/client";

export type { UserRole };

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Admin cấp cao",
  ADMIN: "Admin",
  KY_THUAT: "NV Kỹ thuật",
  CAY_MO: "NV Cấy mô",
  KHO_MO: "NV Kho",
  KHO_THANH_PHAM: "NV Kho thành phẩm",
  QUAN_LY_KHO_THANH_PHAM: "Quản lý kho thành phẩm",
  SALE: "Nhân viên bán hàng",
  MOI_TRUONG: "NV Môi trường",
  DIEU_PHOI: "NV Điều phối",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-red-200 text-red-900",
  ADMIN: "bg-red-100 text-red-800",
  KY_THUAT: "bg-purple-100 text-purple-800",
  CAY_MO: "bg-green-100 text-green-800",
  KHO_MO: "bg-blue-100 text-blue-800",
  KHO_THANH_PHAM: "bg-yellow-100 text-yellow-800",
  QUAN_LY_KHO_THANH_PHAM: "bg-amber-100 text-amber-800",
  SALE: "bg-pink-100 text-pink-800",
  MOI_TRUONG: "bg-cyan-100 text-cyan-800",
  DIEU_PHOI: "bg-orange-100 text-orange-800",
};

// Luồng kiểm tra gắn theo NV cấy mô — do NV kho mô cài đặt (xem /inspection-lane).
export const INSPECTION_LANE_LABELS = {
  XANH: "Xanh",
  DO: "Đỏ",
} as const;

export const INSPECTION_LANE_COLORS = {
  XANH: "bg-primary-light text-primary-strong",
  DO: "bg-danger-light text-destructive",
} as const;

// ADMIN và SUPER_ADMIN đều có full quyền trang/tính năng — chỉ khác ở quyền duyệt tài khoản mới (chỉ SUPER_ADMIN).
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

// QUAN_LY_KHO_THANH_PHAM (Quản lý kho thành phẩm) hiện có ĐÚNG quyền/tính năng như KHO_THANH_PHAM (NV
// kho thành phẩm thường) — tách riêng role từ đầu để sau này bổ sung tính năng quản lý riêng (duyệt/điều
// phối cấp trên NV kho thành phẩm) mà không phải sửa lại mọi nơi đang check role. Dùng hàm này ở MỌI chỗ
// hiện đang check `role === "KHO_THANH_PHAM"` thay vì so sánh trực tiếp.
export function isKhoThanhPhamRole(role: UserRole | null | undefined): boolean {
  return role === "KHO_THANH_PHAM" || role === "QUAN_LY_KHO_THANH_PHAM";
}

// Alert.targetRole so khớp CHÍNH XÁC 1 giá trị (xem prisma/schema.prisma) — mọi nơi tạo cảnh báo nhắm
// "KHO_THANH_PHAM" (VD đơn hàng cần đóng gói) đều phải tới được CẢ Quản lý kho thành phẩm, không chỉ NV
// thường. Dùng hàm này ở nơi TRUY VẤN cảnh báo (không phải nơi tạo — tạo vẫn giữ đúng "KHO_THANH_PHAM"
// làm giá trị lưu, tránh sửa lại mọi lệnh gọi createAlert) để mở rộng thành danh sách role cần khớp.
export function alertTargetRolesFor(role: UserRole | null | undefined): UserRole[] {
  if (!role) return [];
  if (isKhoThanhPhamRole(role)) return ["KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM"];
  return [role];
}

// Ai được sửa/bù nhật ký cấy hộ NV cấy mô (xem PATCH/POST /api/daily-records, /instructions/[id]) —
// Admin/Admin cấp cao được thao tác MỌI kho, KHO_MO chỉ được thao tác đúng NV cùng kho sản xuất mình
// đang làm việc (workplaceWarehouseId) — không được đụng dữ liệu của kho khác dù cùng vào trang này.
export function canManageDailyRecords(
  role: UserRole | null | undefined,
  workplaceWarehouseId: string | null | undefined,
  instructionWarehouseId: string | null | undefined
): boolean {
  if (isAdminRole(role)) return true;
  if (role === "KHO_MO") return !!workplaceWarehouseId && !!instructionWarehouseId && workplaceWarehouseId === instructionWarehouseId;
  return false;
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
  PHONG_NHIEM: "Phòng Nhiễm",
  PHONG_DAT_TIEU_CHUAN: "Phòng đạt tiêu chuẩn",
  PHONG_THEO_DOI: "Phòng theo dõi",
  PHONG_HAN_TUI: "Phòng hàn túi",
  PHONG_THI_TRUONG: "Phòng thị trường",
} as const;

export const ROOM_TYPE_COLORS = {
  PHONG_MAU_ME: "bg-yellow-100 text-yellow-800",
  PHONG_RA_RE: "bg-lime-100 text-lime-800",
  PHONG_TOI: "bg-gray-800 text-white",
  PHONG_NHIEM: "bg-red-100 text-red-800",
  PHONG_DAT_TIEU_CHUAN: "bg-green-100 text-green-800",
  PHONG_THEO_DOI: "bg-orange-100 text-orange-800",
  PHONG_HAN_TUI: "bg-purple-100 text-purple-800",
  PHONG_THI_TRUONG: "bg-cyan-100 text-cyan-800",
} as const;

export const STAGE_LABELS = {
  MAU_ME: "Mẫu mẹ",
  THANH_PHAM: "Thành phẩm",
} as const;

// Quy cách mẫu mẹ (túi cụm) — gắn trên Lot.stageCode khi stage = MAU_ME. Chỉ còn 1 quy cách M05 (đã bỏ
// M03 — dữ liệu M03 cũ đã được gộp sang M05, xem prisma/migrate-m03-to-m05.ts).
export const MOTHER_SPEC_LABELS = {
  M05: "M05 — túi 5 cụm",
} as const;

// Quy cách đóng gói thành phẩm (túi) — gắn trên Lot.stageCode khi stage = THANH_PHAM
export const FINISHED_SPEC_LABELS = {
  T01: "T01 — túi 1 cây",
  T05: "T05 — túi 5 cây",
  T10: "T10 — túi 10 cây",
} as const;

// Số cây trong 1 túi theo quy cách — dùng để quy đổi số cây sang số túi (VD: T05 → chia 5)
export const FINISHED_SPEC_BAG_SIZE = {
  T01: 1,
  T05: 5,
  T10: 10,
} as const;

// Số cụm mẫu mẹ trong 1 túi mẫu mẹ theo quy cách (VD: 1 túi M05 = 5 cụm) — Lot.quantity của M05 LUÔN
// tính thẳng theo cụm (đơn vị nhỏ nhất, giống T01/T05/T10 tính theo cây), bagSize này chỉ dùng khi cần
// biết 1 lô chiếm bao nhiêu túi VẬT LÝ (VD làm tròn khi xếp kệ — xem src/lib/shelf-assignment.ts).
export const MOTHER_SPEC_BAG_SIZE = {
  M05: 5,
} as const;

// Tổng số lượng đã dùng trên 1 kệ (hoặc bất kỳ danh sách lô nào) — đơn vị theo room type (cây ở Phòng ra
// rễ, cụm ở Phòng mẫu mẹ) — nguồn tính DUY NHẤT dùng chung cho cả thuật toán tự xếp kệ
// (src/lib/shelf-assignment.ts), validate khi chọn kệ tay (api/transfers/[id]), lẫn mọi nơi hiển thị
// "Tồn/Sức chứa" (shelf-table.tsx, transfers/receive/page.tsx, inventory/kho-sang).
// Lọc theo stage/status trước khi truyền vào đây nếu cần (VD chỉ lô MAU_ME, chỉ status ACTIVE).
export function sumLotQuantity(lots: { quantity: number }[]): number {
  return lots.reduce((sum, l) => sum + l.quantity, 0);
}

// Đánh dấu Transfer bàn giao "MM dư" (khi chỉ định kết thúc do hết thời gian) — dùng để PATCH
// /api/transfers/[id] nhận diện và xếp thẳng vào Kho quá hạn (planSurplusPlacement) thay vì thuật
// toán bàn giao hàng ngày thông thường (planShelfAssignments), và để UI nhận biết hiển thị đúng mô tả.
export const SURPLUS_TRANSFER_TAG = "SURPLUS_MOTHER_HANDOVER";

// Đánh dấu Transfer bàn giao mẫu mẹ LIÊN KHO sản xuất (KHO_MO chọn giàn nguồn + kho sản xuất khác làm
// đích, xem src/lib/mother-warehouse-transfer.ts) — khác SURPLUS_TRANSFER_TAG (đó là MM dư tự động khi
// chỉ định kết thúc, luôn cùng 1 kho, không cho KHO_MO tự chọn đích).
export const MOTHER_WAREHOUSE_TRANSFER_TAG = "MOTHER_WAREHOUSE_TRANSFER";

// Số chỉ định cấy dự phòng tối thiểu KY_THUAT phải tạo mỗi tuần cho tuần sau, trước Thứ 5 tuần này —
// xem /instructions/backup, getKyThuatStats (dashboard/page.tsx).
export const MIN_BACKUP_INSTRUCTION_COUNT = 5;

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

// Cam = đang giữ, xanh (primary) = đã xác nhận — dùng chung cho mọi nơi hiển thị badge trạng thái đơn.
export const ORDER_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-foreground",
  HELD: "bg-warning-light text-warning-foreground",
  CONFIRMED: "bg-primary-light text-primary-strong",
  SHIPPED: "bg-success-light text-success-foreground",
  CANCELLED: "bg-danger-light text-destructive",
};

// Thị trường xuất hàng của đơn (Order.market) — danh sách cố định, không liên kết Phòng thị trường/tồn kho.
export const MARKET_LABELS = {
  NOI_DIA: "Nội địa",
  DONG_NAM_A: "Đông Nam Á",
  EU: "EU",
  US: "US",
  AUS: "AUS",
  NHAT: "Nhật",
  HAN_QUOC: "Hàn Quốc",
} as const;

export const INSTRUCTION_STATUS_LABELS = {
  DRAFT: "Nháp",
  ACTIVE: "Đang thực hiện",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  ENDED: "Kết thúc",
} as const;

// Nhãn hiển thị chỉ định cấy cho các trang KHÔNG PHẢI Kho mô (Kho mô đã có badge "Chưa bàn giao"/"Đã bàn
// giao / chưa xác nhận" riêng, chi tiết hơn — xem instructions/page.tsx). Status DB "ACTIVE" luôn mang
// nghĩa "Đang thực hiện" nhưng 1 chỉ định mới tạo/chưa được Kho mô bàn giao (handedOverAt còn null) thì
// chưa ai thực sự bắt tay vào cấy — hiện "Chưa thực hiện" (dùng chung màu với DRAFT) thay vì gây hiểu
// nhầm đã có người đang làm.
export function instructionDisplayStatus(
  status: keyof typeof INSTRUCTION_STATUS_LABELS,
  handedOverAt: unknown
): { label: string; notStarted: boolean } {
  if (status === "ACTIVE" && !handedOverAt) return { label: "Chưa thực hiện", notStarted: true };
  return { label: INSTRUCTION_STATUS_LABELS[status], notStarted: false };
}

export const REPACK_STATUS_LABELS = {
  CREATED: "Chờ gán NV",
  ASSIGNED: "Chờ NV nhận bàn giao",
  IN_PROGRESS: "Đang xử lý",
  PENDING_PLACEMENT: "Chờ kiểm tra & sắp xếp",
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
  MEDIUM_HANDOVER_READY: "Môi trường sẵn sàng bàn giao",
  MOTHER_LOT_READY: "Mẫu mẹ sắp đến tuổi cấy chuyển",
  ROOTING_LOT_READY: "Lô ra rễ đến hạn chuyển kho thành phẩm",
  MEDIUM_ORDER_CREATED: "Có đơn đặt hàng môi trường mới",
  CONTAMINATION_PROPOSAL: "Đề xuất trồng/hủy hàng nhiễm",
  INSPECTION_RESULT_READY: "Có kết quả kiểm tra bàn giao",
  ACCOUNT_LOCKED: "Tài khoản bị khóa",
  PASSWORD_RESET_REQUESTED: "Yêu cầu cấp lại mật khẩu",
  MOTHER_CONTAMINATION_HIGH: "Tỉ lệ nhiễm mẫu mẹ sau ủ sáng cao",
  GOODS_RECEIPT_RETURN_DUE: "Phiếu nhập hàng cần kiểm tra trả hàng",
  ORDER_PROCESSING_SHORTFALL: "Xử lý cây thiếu hụt so với đơn hàng",
  EXTRA_WORK_REQUEST: "Đăng ký cấy thêm",
  ASSIGNED_TASK_COMPLETED: "Đã hoàn thành việc được giao",
  MOTHER_WAREHOUSE_TRANSFER_SHORTFALL: "Nhận thiếu mẫu mẹ bàn giao liên kho",
  NV_VIOLATION: "Vi phạm kiểm tra kho tối",
  CUSTOMER_STATUS_UPDATE_DUE: "Cần cập nhật tình trạng khách hàng",
} as const;

export const EXTRA_WORK_REQUEST_TYPE_LABELS = {
  EARLY_COMPLETION: "Hoàn thành sớm chỉ định được giao",
  OVERTIME: "Đăng ký làm thêm ngoài giờ",
} as const;

export const WORK_SESSION_LABELS = {
  SANG: "Buổi sáng",
  CHIEU: "Buổi chiều",
} as const;

export const EXTRA_WORK_REQUEST_STATUS_LABELS = {
  PENDING: "Chờ xử lý",
  APPROVED: "Đã xác nhận",
  REJECTED: "Từ chối",
} as const;

// Đề xuất Kho mô gửi Admin xử lý số lượng ở Phòng nhiễm (xem /contamination-proposals).
export const CONTAMINATION_PROPOSAL_TYPE_LABELS = {
  TRONG: "Trồng lại",
  HUY: "Hủy bỏ",
} as const;

export const CONTAMINATION_PROPOSAL_STATUS_LABELS = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
} as const;

// Lý do 1 dòng lịch sử cộng/trừ vào lô gộp Phòng nhiễm (xem ContaminationRoomEntry, addToContaminationRoom).
export const CONTAMINATION_ENTRY_REASON_LABELS = {
  DARK_ROOM_SELF_CHECK: "NV cấy mô tự kiểm tra nhiễm (phòng tối)",
  DAILY_RECORD: "Nhập dữ liệu cấy hàng ngày",
  DAILY_RECORD_EDIT: "Sửa/bù nhật ký cấy",
  RED_LANE_INSPECTION: "Kho mô kiểm tra luồng Đỏ",
  EXCEL_IMPORT: "Nhập liệu Excel",
  PROPOSAL_REJECTED_REFUND: "Hoàn lại (đề xuất bị từ chối)",
  DARK_ROOM_SELF_CHECK_UNDONE: "Hoàn lại (Kho mô hoàn tác bàn giao)",
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

// Nguyên nhân KY_THUAT chọn khi xử lý alert lệch sản lượng (OUTPUT_DEVIATION) — bắt buộc chọn 1 trong 2.
export const DEVIATION_CAUSE_LABELS = {
  KY_THUAT_SAI: "Do nhân viên kỹ thuật ra chỉ định sai",
  CAY_MO_SAI: "Do nhân viên cấy sai",
} as const;

// Trạng thái khách hàng (Customer.status, CRM Sale) — MAC_DINH = khách VIP/lâu năm gắn cố định với 1 NV,
// không bị nhắc cập nhật hàng tháng và không bị tự thu hồi về Chưa phân công (xem prisma/schema.prisma).
export const CUSTOMER_STATUS_LABELS = {
  CHUA_PHAN_CONG: "Chưa phân công",
  DA_PHAN_CONG: "Đã phân công",
  MAC_DINH: "Mặc định",
} as const;

// Màu Badge tương ứng từng trạng thái khách hàng — dùng chung ở bảng khách hàng (Admin) và trang Cập
// nhật tình trạng khách hàng (Sale), xem src/components/ui/badge.tsx cho các variant.
export const CUSTOMER_STATUS_BADGE_VARIANT = {
  CHUA_PHAN_CONG: "in-progress",
  DA_PHAN_CONG: "completed",
  MAC_DINH: "info",
} as const;

// Nav items per role
export const ROLE_NAV: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  SUPER_ADMIN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/user-management", label: "Quản lý người dùng", icon: "Users" },
    { href: "/production-management", label: "Quản lý Khu sản xuất", icon: "Factory" },
    { href: "/master-data", label: "Cài đặt CSDL chung hệ thống", icon: "Database" },
    { href: "/quality-monitoring", label: "Giám sát & vi phạm", icon: "ShieldAlert" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/instructions/edit", label: "Sửa chỉ định cấy", icon: "PenLine" },
    { href: "/settings/data-import", label: "Nhập liệu trực tiếp", icon: "UploadCloud" },
    { href: "/mother-photo-update/view", label: "Xem dữ liệu hình ảnh", icon: "Images" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/production-management", label: "Quản lý Khu sản xuất", icon: "Factory" },
    { href: "/master-data", label: "Cài đặt CSDL chung hệ thống", icon: "Database" },
    { href: "/quality-monitoring", label: "Giám sát & vi phạm", icon: "ShieldAlert" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/daily-record-edit", label: "Sửa cập nhật dữ liệu cấy", icon: "PenLine" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KY_THUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/instructions", label: "Chỉ định cấy", icon: "ClipboardList" },
    { href: "/instructions/backup", label: "Chỉ định cấy dự phòng", icon: "ShieldPlus" },
    { href: "/repack-instructions", label: "Chỉ định cấy xử lý", icon: "RefreshCw" },
    { href: "/inventory/kho-sang", label: "Phòng mẫu mẹ", icon: "Sun" },
    { href: "/mother-ready", label: "Mẫu mẹ đạt chưa chỉ định", icon: "Sprout" },
    { href: "/planting-check", label: "Kiểm tra tình trạng cấy", icon: "ClipboardCheck" },
    { href: "/mother-photo-update", label: "Cập nhật hình ảnh định kì", icon: "Camera" },
    { href: "/mother-photo-update/view", label: "Xem dữ liệu hình ảnh", icon: "Images" },
    { href: "/reports/overview", label: "Thống kê trực quan", icon: "TrendingUp" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  CAY_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/my-instructions", label: "Chỉ định của tôi", icon: "ClipboardList" },
    { href: "/daily-record", label: "Nhập dữ liệu cấy", icon: "PenLine" },
    { href: "/extra-work", label: "Đăng ký cấy thêm", icon: "CalendarPlus" },
    { href: "/my-dark-room", label: "Phòng tối cá nhân", icon: "Moon" },
    { href: "/product-handover", label: "Bàn giao sản phẩm", icon: "Send" },
    { href: "/handover-record", label: "Ghi nhận bàn giao", icon: "PackageCheck" },
    { href: "/my-reports", label: "Báo cáo cá nhân", icon: "BarChart3" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KHO_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/instructions", label: "Chỉ định cấy chưa bàn giao", icon: "ClipboardList" },
    { href: "/instruction-quantity-edit", label: "Sửa SL chỉ định cấy", icon: "PenLine" },
    { href: "/repack-instructions", label: "Chỉ định cấy xử lý", icon: "RefreshCw" },
    { href: "/transfers/receive-phong-toi", label: "Nhận bàn giao từ kho tối", icon: "PackageCheck" },
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    { href: "/inventory/phong-toi", label: "Phòng tối", icon: "Moon" },
    { href: "/inventory/nhap-kho", label: "Nhập kho thủ công", icon: "PackagePlus" },
    { href: "/mother-shelf-assign", label: "Gán mã cây & NV mẫu mẹ", icon: "Users" },
    { href: "/mother-stock-reshelf", label: "Sắp xếp kho mẫu mẹ", icon: "ArrowLeftRight" },
    { href: "/mother-warehouse-transfer", label: "Luân chuyển mẫu mẹ", icon: "Truck" },
    { href: "/transfers/finished", label: "Bàn giao thành phẩm", icon: "Package" },
    { href: "/medium-orders/receive", label: "Nhận môi trường", icon: "FlaskConical" },
    { href: "/inspection-lane", label: "Cài đặt luồng kiểm tra", icon: "Flag" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/data-corrections", label: "Theo dõi nhập sai dữ liệu cấy", icon: "AlertTriangle" },
    { href: "/violation-types", label: "Danh sách lỗi vi phạm", icon: "ClipboardList" },
    { href: "/violation-report", label: "Báo cáo vi phạm", icon: "AlertTriangle" },
    { href: "/task-completion-report", label: "Số ngày không hoàn thành nhiệm vụ", icon: "CalendarX" },
    { href: "/extra-work-requests", label: "Đăng ký cấy thêm", icon: "CalendarPlus" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/receive", label: "Nhận bàn giao thành phẩm", icon: "PackageCheck" },
    { href: "/transfers/send", label: "Luân chuyển giữa các phòng", icon: "PackageOpen" },
    { href: "/inventory/dat-tieu-chuan", label: "Xem tồn đạt tiêu chuẩn", icon: "PackageCheck" },
    { href: "/inventory/thanh-pham", label: "Xem tồn thực tế", icon: "Package" },
    { href: "/inventory/kho-sang", label: "Phòng ra rễ (mọi cơ sở)", icon: "Sun" },
    { href: "/goods-receipts", label: "Nhập hàng", icon: "Truck" },
    { href: "/processing", label: "Xử lý cây", icon: "Recycle" },
    { href: "/orders/pack", label: "Sắp đơn hàng", icon: "PackageOpen" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Hiện giống HỆT menu KHO_THANH_PHAM — role riêng để sau này thêm mục quản lý mà không ảnh hưởng NV
  // kho thành phẩm thường (xem isKhoThanhPhamRole).
  QUAN_LY_KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/receive", label: "Nhận bàn giao thành phẩm", icon: "PackageCheck" },
    { href: "/transfers/send", label: "Luân chuyển giữa các phòng", icon: "PackageOpen" },
    { href: "/inventory/dat-tieu-chuan", label: "Xem tồn đạt tiêu chuẩn", icon: "PackageCheck" },
    { href: "/inventory/thanh-pham", label: "Xem tồn thực tế", icon: "Package" },
    { href: "/inventory/kho-sang", label: "Phòng ra rễ (mọi cơ sở)", icon: "Sun" },
    { href: "/goods-receipts", label: "Nhập hàng", icon: "Truck" },
    { href: "/processing", label: "Xử lý cây", icon: "Recycle" },
    { href: "/orders/pack", label: "Sắp đơn hàng", icon: "PackageOpen" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  SALE: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/customer-check", label: "Kiểm tra trùng khách", icon: "Search" },
    { href: "/customer-status", label: "Cập nhật tình trạng khách hàng", icon: "RefreshCw" },
    { href: "/inventory/dat-tieu-chuan", label: "Xem tồn đạt tiêu chuẩn", icon: "Package" },
    { href: "/orders", label: "Kiểm tra đáp ứng", icon: "ShoppingCart" },
    { href: "/orders/list", label: "Danh sách đơn hàng", icon: "ClipboardList" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  MOI_TRUONG: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/medium-orders", label: "Đơn đặt hàng MT", icon: "FlaskConical" },
    { href: "/medium-orders/current", label: "Bàn giao môi trường", icon: "PackageCheck" },
    { href: "/materials", label: "Quản lý vật tư", icon: "Boxes" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  DIEU_PHOI: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/inventory/all", label: "Tồn kho tổng", icon: "Warehouse" },
    { href: "/purchase-orders", label: "Đặt hàng NCC", icon: "ShoppingBag" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
};
