import type { UserRole, EmploymentType, CustomerGroup } from "@prisma/client";

export type { UserRole, EmploymentType, CustomerGroup };

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Admin cấp cao",
  ADMIN: "Admin",
  ADMIN_KY_THUAT: "Admin kỹ thuật",
  KY_THUAT: "NV Kỹ thuật",
  CAY_MO: "NV Cấy mô",
  KHO_MO: "NV Kho",
  KHO_THANH_PHAM: "NV Kho thành phẩm",
  QUAN_LY_KHO_THANH_PHAM: "Quản lý kho thành phẩm",
  SALE: "Nhân viên bán hàng",
  MOI_TRUONG: "NV Môi trường",
  DIEU_PHOI: "NV Điều phối",
  HANH_CHINH_NHAN_SU: "NV Hành chính nhân sự",
  NHAN_VIEN_SAN_XUAT: "NV Sản xuất",
  NHAN_VIEN_QUAN_LY_VUON: "NV Quản lý vườn",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-red-200 text-red-900",
  ADMIN: "bg-red-100 text-red-800",
  ADMIN_KY_THUAT: "bg-rose-100 text-rose-800",
  KY_THUAT: "bg-purple-100 text-purple-800",
  CAY_MO: "bg-green-100 text-green-800",
  KHO_MO: "bg-blue-100 text-blue-800",
  KHO_THANH_PHAM: "bg-yellow-100 text-yellow-800",
  QUAN_LY_KHO_THANH_PHAM: "bg-amber-100 text-amber-800",
  SALE: "bg-pink-100 text-pink-800",
  MOI_TRUONG: "bg-cyan-100 text-cyan-800",
  DIEU_PHOI: "bg-orange-100 text-orange-800",
  HANH_CHINH_NHAN_SU: "bg-indigo-100 text-indigo-800",
  NHAN_VIEN_SAN_XUAT: "bg-lime-100 text-lime-800",
  NHAN_VIEN_QUAN_LY_VUON: "bg-teal-100 text-teal-800",
};

// Luồng kiểm tra gắn theo NV cấy mô — hệ thống tự tính mỗi tháng (xem src/lib/inspection-lane.ts),
// không còn do Kho mô cài đặt tay. Vàng/Đỏ xử lý bàn giao giống hệt nhau (đều phải kiểm tra lại).
export const INSPECTION_LANE_LABELS = {
  XANH: "Xanh",
  VANG: "Vàng",
  DO: "Đỏ",
} as const;

export const INSPECTION_LANE_COLORS = {
  XANH: "bg-primary-light text-primary-strong",
  VANG: "bg-warning-light text-warning-foreground",
  DO: "bg-danger-light text-destructive",
} as const;

// ADMIN và SUPER_ADMIN đều có full quyền trang/tính năng — chỉ khác ở quyền duyệt tài khoản mới (chỉ SUPER_ADMIN).
// ADMIN_KY_THUAT cũng coi là admin (qua hàm này) để tự động có quyền ở MỌI nơi đang gọi isAdminRole — trừ
// đúng 3 trang chặn riêng ngay tại page.tsx (master-data, quality-monitoring, rooting-forecast-requests,
// xem comment ở UserRole.ADMIN_KY_THUAT trong schema.prisma) dù hàm này vẫn trả về true cho role đó.
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "ADMIN_KY_THUAT";
}

// Loại hợp đồng — chỉ áp dụng cho NV cấy mô (CAY_MO), xem User.employmentType.
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  CHINH_THUC: "Chính thức",
  THU_VIEC: "Thử việc",
};

export const EMPLOYMENT_TYPE_COLORS: Record<EmploymentType, string> = {
  CHINH_THUC: "bg-success-light text-success-foreground",
  THU_VIEC: "bg-warning-light text-warning-foreground",
};

// Ai được cài đặt Loại hợp đồng (Chính thức/Thử việc) của NV cấy mô — Admin cấp cao (SUPER_ADMIN) và
// NV Hành chính nhân sự, KHÔNG bao gồm Admin thường (khác các field Admin-only khác như plantingCapacity).
export function canEditEmploymentType(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// "Cấy học việc" — nhãn/màu badge dùng chung ở bảng Người dùng, xem User.isTrainee.
export const TRAINEE_LABEL = "Cấy học việc";
export const TRAINEE_BADGE_COLOR = "bg-info-light text-info-foreground";

// Ai được gán "Vị trí làm việc" (khu sản xuất/kho thành phẩm, xem User.workplaceWarehouseId) cho NV —
// cùng phạm vi role với canEditEmploymentType (SUPER_ADMIN + NV Hành chính nhân sự, KHÔNG bao gồm Admin
// thường) — trước đây chỉ SUPER_ADMIN, mở thêm cho HR để tự sắp xếp nhân sự theo cơ sở mà không cần nhờ
// Admin cấp cao.
export function canAssignWorkplace(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// Ai được cài đặt các bảng tham số lương + xem "Bảng lương" (dữ liệu lương nhạy cảm) — cùng phạm vi
// role với canEditEmploymentType (SUPER_ADMIN + NV Hành chính nhân sự, KHÔNG bao gồm Admin thường/
// KHO_MO), tách hàm riêng cho rõ nghĩa ở các chỗ gọi liên quan tới lương.
export function canManagePayroll(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// Ai được đánh dấu 1 NV "Nghỉ việc" (khoá đăng nhập ngay, giữ nguyên dữ liệu lịch sử — xem
// User.isActive, PATCH /api/users/[id] nhánh "resign") — cùng phạm vi role với canAssignWorkplace/
// canEditEmploymentType (SUPER_ADMIN + NV Hành chính nhân sự).
export function canManageEmploymentStatus(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// Vai trò thuộc "cơ sở sản xuất" (kho sản xuất, khác kho thành phẩm/SALE) — dùng để giới hạn phạm vi
// canEditEmployeeCode bên dưới, khớp nhóm "sanXuatWarehouses" ở edit-user-dialog.tsx/users/page.tsx.
export const PRODUCTION_SITE_ROLES: UserRole[] = ["KHO_MO", "CAY_MO", "MOI_TRUONG", "KY_THUAT", "NHAN_VIEN_SAN_XUAT"];

// Ai được sửa riêng "Mã nhân viên" của NV thuộc cơ sở sản xuất (PRODUCTION_SITE_ROLES) — trước đây chỉ
// sửa được qua "Sửa tài khoản" đầy đủ (chỉ SUPER_ADMIN, xem EditUserDialog), giờ mở thêm ô sửa nhanh
// riêng mã ở bảng Người dùng cho NV Hành chính nhân sự tự cập nhật theo thực tế nhân sự tại từng cơ sở,
// không cần quyền sửa tên/email/vai trò/mật khẩu — cùng phạm vi role với canEditEmploymentType/
// canAssignWorkplace (SUPER_ADMIN + NV Hành chính nhân sự).
export function canEditEmployeeCode(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// Ai được sửa riêng "Tên" NV — giống canEditEmployeeCode nhưng KHÔNG giới hạn PRODUCTION_SITE_ROLES (NV
// Hành chính nhân sự vốn không thấy được tài khoản Admin/Admin cao nhất trong danh sách — xem
// adminExclusion ở users/page.tsx — nên phạm vi thực tế đã tự loại trừ nhóm đó mà không cần thêm điều
// kiện role ở đây, khớp đúng "sửa được như Admin cao nhất" cho mọi NV còn lại).
export function canEditEmployeeName(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// Vai trò được phép gán khi tạo tài khoản mới, theo vai trò người tạo — Admin/Admin cấp cao tạo được mọi
// vai trò (trừ SUPER_ADMIN, không tạo thêm Admin cấp cao qua UI); NV Hành chính nhân sự cũng thêm được
// người dùng nhưng CHỈ các vị trí nhân viên, không tạo được tài khoản Admin (xem POST /api/users).
export const ALL_ASSIGNABLE_ROLES: UserRole[] = [
  "ADMIN", "ADMIN_KY_THUAT", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM",
  "SALE", "MOI_TRUONG", "DIEU_PHOI", "HANH_CHINH_NHAN_SU", "NHAN_VIEN_SAN_XUAT", "NHAN_VIEN_QUAN_LY_VUON",
];
export const STAFF_ONLY_ROLES: UserRole[] = ALL_ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" && r !== "ADMIN_KY_THUAT");

export function creatableRolesFor(actorRole: UserRole | null | undefined): UserRole[] {
  if (isAdminRole(actorRole)) return ALL_ASSIGNABLE_ROLES;
  if (actorRole === "HANH_CHINH_NHAN_SU") return STAFF_ONLY_ROLES;
  return [];
}

// QUAN_LY_KHO_THANH_PHAM (Quản lý kho thành phẩm) hiện có ĐÚNG quyền/tính năng như KHO_THANH_PHAM (NV
// kho thành phẩm thường) — tách riêng role từ đầu để sau này bổ sung tính năng quản lý riêng (duyệt/điều
// phối cấp trên NV kho thành phẩm) mà không phải sửa lại mọi nơi đang check role. Dùng hàm này ở MỌI chỗ
// hiện đang check `role === "KHO_THANH_PHAM"` thay vì so sánh trực tiếp.
export function isKhoThanhPhamRole(role: UserRole | null | undefined): boolean {
  return role === "KHO_THANH_PHAM" || role === "QUAN_LY_KHO_THANH_PHAM";
}

// Quản lý kho thành phẩm được thao tác Check/Tạm giữ/Xác nhận/Hủy đơn hàng THAY cho NV bán hàng (chưa
// có tài khoản riêng cho từng NV bán hàng ngoài công ty) — luôn gán saleId của đơn = customer.assignedToId
// (NV bán hàng thật đang phụ trách khách đó), KHÔNG phải id của người quản lý đang thao tác hộ, để dữ
// liệu giống hệt như khi sau này NV bán hàng tự nhập (xem POST /api/orders). Dùng ở MỌI API đơn hàng vốn
// trước đây chỉ check role === "SALE".
export function canActAsSale(role: string | null | undefined): boolean {
  return role === "SALE" || role === "QUAN_LY_KHO_THANH_PHAM";
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

// "Phân công nhiệm vụ ngày" — 2 loại việc không có bản ghi nghiệp vụ gốc (khác Transfer/GoodsReceipt/Order).
export const DAILY_TASK_TYPE_LABELS = {
  KIEM_TRA_CAY: "Kiểm tra cây",
  DE_XUAT_TRONG_HUY: "Đề xuất trồng/hủy",
} as const;

export const DAILY_TASK_STATUS_LABELS = {
  PENDING: "Chưa hoàn thành",
  COMPLETED: "Đã hoàn thành",
  CANCELLED: "Đã hủy",
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
  INSTRUCTION_RETURNED_UNHANDED: "Chỉ định cấy được hoàn lại",
  DE_XUAT_TRONG_HUY_WEEKLY_DUE: "Nhắc hạn Đề xuất trồng/hủy tuần",
} as const;

// Trang đích khi bấm "Xem chi tiết" ở trang Thông báo cho 1 số loại thông báo có nơi xử lý cụ thể — bấm
// vào vừa đánh dấu đã xem vừa điều hướng thẳng tới đó, thay vì chỉ có nút "Đã xem" chung chung (xem
// alerts/page.tsx). Loại nào không có trong map này vẫn giữ nút "Đã xem" như cũ.
export const ALERT_DETAIL_LINKS: Partial<Record<keyof typeof ALERT_TYPE_LABELS, string>> = {
  CONTAMINATION_PROPOSAL: "/production-management?tab=contamination",
};

// Nhiệm vụ nhỏ "Kiểm tra kho cá nhân" (thuộc checklist "Kiểm tra kho tối" của Kho mô) chỉ cho chọn lỗi vi
// phạm thuộc 2 nhóm này — đúng phạm vi kiểm tra thực tế lúc đi kiểm tra kho tối (tem nhãn + sắp xếp sản
// phẩm), tránh danh sách dài lẫn cả lỗi không liên quan (an toàn lao động, phần mềm...). Dùng chung ở cả
// client (DarkRoomInspectionDialog) và server (POST /api/dark-room-inspection) để validate khớp nhau.
export const DARK_ROOM_CHECK_VIOLATION_GROUPS = ["Tem nhãn và truy xuất", "Kho, khay và sắp xếp sản phẩm"] as const;

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

export const EXTRA_WORK_PURPOSE_LABELS = {
  COMPLETE_MAIN_INSTRUCTION: "Để hoàn thành chỉ định cấy chính được giao trong tuần",
  INCREASE_OUTPUT: "Để gia tăng sản lượng",
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

// Nhãn trạng thái đơn đặt hàng môi trường (MediumOrder) — dựa trên confirmedAt/endedAt (null/có giá trị).
export const MEDIUM_ORDER_STATUS_LABELS = {
  UNCONFIRMED: "Chưa xác nhận",
  IN_PROGRESS: "Đang thực hiện",
  ENDED: "Đã kết thúc",
} as const;

// Nhãn trạng thái đơn môi trường phát sinh cho đơn xử lý (ProcessingMediumOrder) — khác MediumOrder,
// không có lịch tuần, chỉ 2 trạng thái.
export const PROCESSING_MEDIUM_ORDER_STATUS_LABELS = {
  PENDING: "Chờ pha",
  COMPLETED: "Đã hoàn thành",
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

// "Nhóm khách hàng" (Customer.customerGroup) — chỉ Admin cấp cao phân loại. KHACH_CONG_TY_LON được giữ
// đơn 5 tháng thay vì theo Năng lực giữ đơn mặc định của NV Sale (xem CustomerGroup, prisma/schema.prisma).
export const CUSTOMER_GROUP_LABELS = {
  KHACH_SI_NHO: "Khách sỉ nhỏ",
  KHACH_CONG_TY: "Khách công ty",
  KHACH_CONG_TY_LON: "Khách công ty lớn",
} as const;

export const CUSTOMER_GROUP_BADGE_VARIANT = {
  KHACH_SI_NHO: "outline",
  KHACH_CONG_TY: "info",
  KHACH_CONG_TY_LON: "completed",
} as const;

// Nav items per role
export const ROLE_NAV: Record<UserRole, { href: string; label: string; icon: string }[]> = {
  SUPER_ADMIN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Quản lý người dùng", icon: "Users" },
    { href: "/production-management", label: "Quản lý Khu sản xuất", icon: "Factory" },
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    { href: "/master-data", label: "Cài đặt CSDL chung hệ thống", icon: "Database" },
    { href: "/production-gardens", label: "Vườn sản xuất", icon: "Sprout" },
    { href: "/quality-monitoring", label: "Giám sát & vi phạm", icon: "ShieldAlert" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/rooting-forecast-requests", label: "Duyệt đề xuất cây ra rễ", icon: "PackageCheck" },
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
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    { href: "/master-data", label: "Cài đặt CSDL chung hệ thống", icon: "Database" },
    { href: "/quality-monitoring", label: "Giám sát & vi phạm", icon: "ShieldAlert" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/rooting-forecast-requests", label: "Duyệt đề xuất cây ra rễ", icon: "PackageCheck" },
    { href: "/daily-record-edit", label: "Sửa cập nhật dữ liệu cấy", icon: "PenLine" },
    { href: "/instructions/list", label: "Chỉ định cấy đã tạo", icon: "ClipboardList" },
    { href: "/mother-photo-update/view", label: "Xem dữ liệu hình ảnh", icon: "Images" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Admin kỹ thuật — y hệt ADMIN ở trên, TRỪ 3 mục: Cài đặt CSDL chung hệ thống, Giám sát & vi phạm, Duyệt
  // đề xuất cây ra rễ (chặn thêm ngay tại page.tsx của 3 trang đó dù isAdminRole trả về true cho role
  // này — xem comment UserRole.ADMIN_KY_THUAT ở schema.prisma). Có thêm mục R&D (/rnd) riêng.
  ADMIN_KY_THUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/production-management", label: "Quản lý Khu sản xuất", icon: "Factory" },
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/daily-record-edit", label: "Sửa cập nhật dữ liệu cấy", icon: "PenLine" },
    { href: "/instructions/list", label: "Chỉ định cấy đã tạo", icon: "ClipboardList" },
    { href: "/rnd", label: "R&D", icon: "FlaskConical" },
    { href: "/mother-photo-update/view", label: "Xem dữ liệu hình ảnh", icon: "Images" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KY_THUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/instructions", label: "Chỉ định cấy", icon: "ClipboardList" },
    { href: "/instructions/backup", label: "Chỉ định cấy dự phòng", icon: "ShieldPlus" },
    { href: "/repack-instructions", label: "Chỉ định cấy xử lý", icon: "RefreshCw" },
    { href: "/inventory/kho-sang", label: "Phòng mẫu mẹ", icon: "Sun" },
    { href: "/planting-check", label: "Kiểm tra tình trạng cấy", icon: "ClipboardCheck" },
    { href: "/mother-photo-update", label: "Cập nhật hình ảnh định kì", icon: "Camera" },
    { href: "/mother-photo-update/view", label: "Xem dữ liệu hình ảnh", icon: "Images" },
    { href: "/reports/overview", label: "Thống kê trực quan", icon: "TrendingUp" },
    { href: "/reports/planting-log-summary", label: "Dữ liệu nhật ký cấy", icon: "BookOpen" },
    { href: "/rooting-forecast", label: "Dự kiến đáp ứng cây ra rễ", icon: "Sprout" },
    { href: "/reports/rooting-plan-vs-actual", label: "Kế hoạch vs thực tế cây ra rễ", icon: "Gauge" },
    { href: "/reports/inspection-lane", label: "Phân loại luồng kiểm tra", icon: "Flag" },
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
    // "Chỉ định cấy xử lý" gộp vào tab trong hub này (xem instruction-quantity-edit/page.tsx) — route
    // /repack-instructions vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/instruction-quantity-edit", label: "Chỉ định cấy", icon: "ClipboardList" },
    // Sửa/bù nhật ký cấy hộ NV cấy mô (đúng kho mình làm việc, xem canManageDailyRecords) — vi phạm nhập
    // sai vẫn tính đúng cho NV cấy mô bất kể KHO_MO hay Admin sửa, xem PATCH /api/daily-records/[id].
    { href: "/daily-record-edit", label: "Sửa cập nhật dữ liệu cấy", icon: "PenLine" },
    { href: "/transfers/receive-phong-toi", label: "Nhận bàn giao từ kho tối", icon: "PackageCheck" },
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    { href: "/inventory/phong-toi", label: "Phòng tối", icon: "Moon" },
    { href: "/reports/overview-kho-mo", label: "Thống kê trực quan", icon: "TrendingUp" },
    { href: "/reports/inspection-lane", label: "Phân loại luồng kiểm tra", icon: "Flag" },
    // Gộp "Nhập kho thủ công" + "Gán mã cây & NV mẫu mẹ" + "Cài đặt luồng kiểm tra" vào hub này (xem
    // manual-settings/page.tsx) — 3 route cũ vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/manual-settings", label: "Cài đặt thủ công", icon: "Settings" },
    { href: "/mother-stock-reshelf", label: "Sắp xếp kho mẫu mẹ", icon: "ArrowLeftRight" },
    { href: "/transfers/finished", label: "Bàn giao thành phẩm", icon: "Package" },
    { href: "/medium-orders/receive", label: "Nhận môi trường", icon: "FlaskConical" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/replant-handovers", label: "Bàn giao cây trồng", icon: "Sprout" },
    // "Báo cáo tỉ lệ nhiễm" gộp vào tab trong hub này (xem violation-report/page.tsx) — route
    // /reports/mother-contamination vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/violation-report", label: "Báo cáo vi phạm", icon: "AlertTriangle" },
    { href: "/extra-work-requests", label: "Đăng ký cấy thêm", icon: "CalendarPlus" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // "Nhận hàng" (/goods-receipts) gộp cả "Nhận hàng từ NCC" lẫn "Nhận bàn giao thành phẩm" (route
  // /transfers/receive cũ đã xoá, nội dung chuyển vào TransferReceiveBoard trong trang này) — chỉ còn 1
  // mục menu duy nhất cho cả 2 luồng nhận hàng.
  KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/send", label: "Trả hàng Kho Sản xuất", icon: "PackageOpen" },
    { href: "/inventory/dat-tieu-chuan", label: "Xem tồn đạt tiêu chuẩn", icon: "PackageCheck" },
    { href: "/inventory/thanh-pham", label: "Xem tồn thực tế", icon: "Package" },
    { href: "/goods-receipts", label: "Nhận hàng", icon: "Truck" },
    { href: "/orders/pack", label: "Sắp xếp đơn hàng", icon: "PackageOpen" },
    { href: "/shipping", label: "Xuất hàng", icon: "Send" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Khác KHO_THANH_PHAM: 3 mục xem tồn (Xem tồn của Khu sản xuất/Xem tồn đạt tiêu chuẩn/Xem tồn thực tế)
  // gộp chung 1 mục "Xem tồn kho" (xem /inventory, KHÔNG áp dụng "Phòng ra rễ" cho NV kho thành phẩm
  // thường — redirect riêng role === "KHO_THANH_PHAM" ở inventory/kho-sang/page.tsx), có thêm "Phân công
  // nhiệm vụ ngày" + "Theo dõi tiến độ công việc" (chỉ Quản lý mới giao việc/xem tiến độ, xem
  // isKhoThanhPhamRole, /task-assignment, /task-progress). 3 mục đơn hàng (Tạo đơn hàng hộ Sale/Danh
  // sách đơn hàng/Sắp xếp đơn hàng) cũng gộp chung 1 mục "Xử lý đơn hàng" (xem /orders — hub y hệt
  // /inventory, trang tạo đơn thật đã dời sang /orders/create) — còn lại giống hệt KHO_THANH_PHAM.
  QUAN_LY_KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/task-assignment", label: "Phân công nhiệm vụ ngày", icon: "ClipboardList" },
    { href: "/task-progress", label: "Theo dõi tiến độ công việc", icon: "Gauge" },
    { href: "/transfers/send", label: "Trả hàng Kho Sản xuất", icon: "PackageOpen" },
    { href: "/inventory", label: "Xem tồn kho", icon: "Warehouse" },
    { href: "/goods-receipts", label: "Nhận hàng", icon: "Truck" },
    { href: "/processing", label: "Xử lý cây", icon: "Recycle" },
    { href: "/orders", label: "Xử lý đơn hàng", icon: "ShoppingCart" },
    { href: "/shipping", label: "Xuất hàng", icon: "Send" },
    { href: "/reports/inventory-flow-summary", label: "Báo cáo Nhập - Xuất", icon: "BarChart3" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  SALE: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/customer-check", label: "Kiểm tra trùng khách", icon: "Search" },
    { href: "/customer-status", label: "Cập nhật tình trạng khách hàng", icon: "RefreshCw" },
    { href: "/inventory/dat-tieu-chuan", label: "Xem tồn đạt tiêu chuẩn", icon: "Package" },
    // "Kiểm tra đáp ứng" + "Danh sách đơn hàng" gộp chung 1 mục "Xử lý đơn hàng" (xem /orders, hub y
    // hệt /inventory — trang check/tạo đơn thật đã dời sang /orders/create).
    { href: "/orders", label: "Xử lý đơn hàng", icon: "ShoppingCart" },
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
  HANH_CHINH_NHAN_SU: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/violation-report", label: "Báo cáo vi phạm", icon: "AlertTriangle" },
    { href: "/reports/handover-summary", label: "Bàn giao & ghi nhận theo tháng", icon: "PackageCheck" },
    { href: "/payroll-settings", label: "Cài đặt lương", icon: "Settings" },
    { href: "/reports/payroll", label: "Bảng lương", icon: "DollarSign" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  NHAN_VIEN_SAN_XUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/replant-handovers", label: "Nhận bàn giao cây trồng", icon: "PackageCheck" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Chưa có trang nghiệp vụ riêng (xem Vườn sản xuất được gán ở /production-gardens, chỉ SUPER_ADMIN
  // sửa) — menu tối thiểu, mở rộng sau nếu NVQLV cần tự thao tác trên Vườn của mình.
  NHAN_VIEN_QUAN_LY_VUON: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
};
