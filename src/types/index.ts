import type { UserRole, EmploymentType, CustomerGroup, AlertType } from "@prisma/client";

export type { UserRole, EmploymentType, CustomerGroup, AlertType };

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Admin cấp cao",
  ADMIN: "Admin",
  ADMIN_KY_THUAT: "Admin kỹ thuật",
  KY_THUAT: "NV Kỹ thuật",
  CAY_MO: "NV Cấy mô",
  KHO_MO: "NV Kho",
  TRO_LY: "NV Trợ lý",
  KHO_THANH_PHAM: "NV Kho thành phẩm",
  QUAN_LY_KHO_THANH_PHAM: "Quản lý kho thành phẩm",
  SALE: "Nhân viên bán hàng",
  MOI_TRUONG: "NV Môi trường",
  DIEU_PHOI: "NV Điều phối",
  HANH_CHINH_NHAN_SU: "NV Hành chính nhân sự",
  NHAN_VIEN_SAN_XUAT: "NV Sản xuất",
  NHAN_VIEN_QUAN_LY_VUON: "NV Quản lý vườn",
  NV_CHAM_SOC_CAY_MO: "NV Chăm sóc cây mô",
  DOI_TAC_VAN_HANH: "Đối tác vận hành",
  KE_TOAN: "NV Kế toán",
  ADMIN_HOA_LAN: "Admin hoa lan",
  TRO_LY_HOA_LAN: "Trợ lý hoa lan",
  KHACH_HANG_LAN: "Khách hàng lan",
  DIEM_BAN_LAN: "Điểm bán lẻ lan",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-red-200 text-red-900",
  ADMIN: "bg-red-100 text-red-800",
  ADMIN_KY_THUAT: "bg-rose-100 text-rose-800",
  KY_THUAT: "bg-purple-100 text-purple-800",
  CAY_MO: "bg-green-100 text-green-800",
  KHO_MO: "bg-blue-100 text-blue-800",
  TRO_LY: "bg-violet-light text-violet-foreground",
  KHO_THANH_PHAM: "bg-yellow-100 text-yellow-800",
  QUAN_LY_KHO_THANH_PHAM: "bg-amber-100 text-amber-800",
  SALE: "bg-pink-100 text-pink-800",
  MOI_TRUONG: "bg-cyan-100 text-cyan-800",
  DIEU_PHOI: "bg-orange-100 text-orange-800",
  HANH_CHINH_NHAN_SU: "bg-indigo-100 text-indigo-800",
  NHAN_VIEN_SAN_XUAT: "bg-lime-100 text-lime-800",
  NHAN_VIEN_QUAN_LY_VUON: "bg-teal-100 text-teal-800",
  NV_CHAM_SOC_CAY_MO: "bg-primary-light text-primary-strong",
  DOI_TAC_VAN_HANH: "bg-sky-100 text-sky-800",
  KE_TOAN: "bg-info-light text-info-foreground",
  ADMIN_HOA_LAN: "bg-primary-light text-primary-strong",
  TRO_LY_HOA_LAN: "bg-secondary text-secondary-foreground",
  KHACH_HANG_LAN: "bg-violet-light text-violet-foreground",
  DIEM_BAN_LAN: "bg-achievement text-achievement-foreground",
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

// Các trang đơn hàng (/orders/list, /orders/list/[id], /orders/[id], /orders/pack, /orders/create) — CHỈ NV bán
// hàng, NV điều phối, NV/Quản lý kho thành phẩm và các Admin; mọi vai trò khác bị chặn hẳn (isPageAllowed mặc
// định cho phép nếu chưa cấu hình nên không đủ). Phạm vi đơn từng vai trò thấy vẫn lọc riêng ở từng trang.
export function canAccessOrderPages(role: UserRole | null | undefined): boolean {
  return role === "SALE" || role === "DIEU_PHOI" || role === "KHO_THANH_PHAM" || role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role);
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

// Ai được ghi đè tạm thời "luồng kiểm tra" (Xanh/Vàng/Đỏ) của NV cấy mô theo khoảng ngày (xem
// User.inspectionLaneOverride*, PATCH /api/users/[id] nhánh inspectionLaneOverride/
// cancelInspectionLaneOverride) — CHỈ Admin cấp cao + Admin kỹ thuật, KHÔNG bao gồm Admin thường (khác
// isAdminRole ở trên, vốn gồm cả 3 role).
export function canOverrideInspectionLane(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN_KY_THUAT";
}

// Ai được đánh dấu 1 NV "Nghỉ việc" (khoá đăng nhập ngay, giữ nguyên dữ liệu lịch sử — xem
// User.isActive, PATCH /api/users/[id] nhánh "resign") — cùng phạm vi role với canAssignWorkplace/
// canEditEmploymentType (SUPER_ADMIN + NV Hành chính nhân sự).
export function canManageEmploymentStatus(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "HANH_CHINH_NHAN_SU";
}

// Kho mô và Trợ lý cùng kiểm tra/ghi nhận lỗi vi phạm NV cấy mô (trong kho làm việc của mình) — dùng ở
// trang/API Báo cáo vi phạm thay cho so sánh `role === "KHO_MO"`.
export function isViolationCheckerRole(role: UserRole | null | undefined): boolean {
  return role === "KHO_MO" || role === "TRO_LY";
}

// Vai trò thuộc "cơ sở sản xuất" (kho sản xuất, khác kho thành phẩm/SALE) — dùng để giới hạn phạm vi
// canEditEmployeeCode bên dưới, khớp nhóm "sanXuatWarehouses" ở edit-user-dialog.tsx/users/page.tsx.
export const PRODUCTION_SITE_ROLES: UserRole[] = ["KHO_MO", "TRO_LY", "CAY_MO", "MOI_TRUONG", "KY_THUAT", "NHAN_VIEN_SAN_XUAT"];

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

// Cài đặt Sale — mục Khách hàng + NV quản lý (xem /settings/sale): Admin cấp cao và NV Trợ lý (mở cho Trợ lý
// 14/10/2026). Mục Thị trường: Trợ lý chỉ XEM (15/10/2026), thêm/sửa/bật tắt CHỈ Admin cấp cao — canEditSaleMarkets.
export function canManageSaleCustomers(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "TRO_LY";
}

// Riêng mục Khách hàng (danh sách, thêm/sửa, nhập/cập nhật bằng Excel): NV Trợ lý chỉ được TẠM THỜI tới hết
// 18/10/2026 (mở 15/10/2026, 3 ngày); mở lại 21/10 → hết 24/10/2026 để tách khách ĐNA sang từng nước (TH/ID/PH/SG/IN/JP)
// — sau mốc này ẩn hẳn mục Khách hàng với Trợ lý (tab, trang, API), Trợ lý
// vẫn giữ NV quản lý + Thị trường (xem) theo canManageSaleCustomers/canEditSaleMarkets.
export const TRO_LY_SALE_CUSTOMERS_UNTIL = new Date("2026-10-25T00:00:00+07:00");
export function canAccessSaleCustomerList(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || (role === "TRO_LY" && Date.now() < TRO_LY_SALE_CUSTOMERS_UNTIL.getTime());
}

export function canEditSaleMarkets(role: UserRole | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

// Vai trò được phép gán khi tạo tài khoản mới, theo vai trò người tạo — Admin/Admin cấp cao tạo được mọi
// vai trò (trừ SUPER_ADMIN, không tạo thêm Admin cấp cao qua UI); NV Hành chính nhân sự cũng thêm được
// người dùng nhưng CHỈ các vị trí nhân viên, không tạo được tài khoản Admin (xem POST /api/users).
export const ALL_ASSIGNABLE_ROLES: UserRole[] = [
  "ADMIN", "ADMIN_KY_THUAT", "KY_THUAT", "CAY_MO", "KHO_MO", "TRO_LY", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM",
  "SALE", "MOI_TRUONG", "DIEU_PHOI", "HANH_CHINH_NHAN_SU", "NHAN_VIEN_SAN_XUAT", "NHAN_VIEN_QUAN_LY_VUON",
  "NV_CHAM_SOC_CAY_MO", "DOI_TAC_VAN_HANH", "KE_TOAN", "ADMIN_HOA_LAN", "TRO_LY_HOA_LAN",
];
export const STAFF_ONLY_ROLES: UserRole[] = ALL_ASSIGNABLE_ROLES.filter((r) => r !== "ADMIN" && r !== "ADMIN_KY_THUAT" && r !== "ADMIN_HOA_LAN");

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
  THI_TRUONG: "Kho thị trường",
} as const;

export const WAREHOUSE_TYPE_COLORS = {
  SAN_XUAT: "bg-blue-100 text-blue-800",
  THANH_PHAM: "bg-green-100 text-green-800",
  THI_TRUONG: "bg-sky-100 text-sky-800",
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
  PHONG_CHO_XU_LY: "Phòng chờ xử lý",
  PHONG_DOI_XU_LY: "Phòng đợi xử lý",
  PHONG_SAN_PHAM_DAT: "Phòng sản phẩm đạt",
  PHONG_SAN_PHAM_KHONG_DAT: "Phòng sản phẩm không đạt",
  PHONG_CAY_TRONG: "Phòng cây trồng",
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
  PHONG_CHO_XU_LY: "bg-warning-light text-warning-foreground",
  PHONG_DOI_XU_LY: "bg-warning-light text-warning-foreground",
  PHONG_SAN_PHAM_DAT: "bg-emerald-100 text-emerald-800",
  PHONG_SAN_PHAM_KHONG_DAT: "bg-rose-100 text-rose-800",
  PHONG_CAY_TRONG: "bg-teal-100 text-teal-800",
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

// Quy cách có đơn giá riêng trong "Quy đổi sản lượng – KPI" (PlantTypeKpiRate) — đúng các quy cách NV cấy
// mô bàn giao phòng tối. Bàn giao quy cách ngoài danh sách (hoặc chưa đặt đơn giá) = quy đổi 0đ.
export const KPI_RATE_STAGE_CODES = ["M05", "T01", "T05"] as const;

// Quy cách KHÔNG đặt đơn giá riêng mà tính bằng đơn giá của quy cách khác cùng mã cây (17/10/2026: T10 = T05,
// VD kết quả Chỉ định cấy xử lý ra T10). Hiện chỉ đọc ở trang "Quy đổi sản lượng-KPI".
export const KPI_RATE_STAGE_ALIASES: Record<string, (typeof KPI_RATE_STAGE_CODES)[number]> = { T10: "T05" };

// Map đơn giá key `${plantTypeId}|${stageCode}` → VNĐ/đơn vị, đã kèm các quy cách dùng chung đơn giá
// (KPI_RATE_STAGE_ALIASES) — dùng ở mọi nơi quy đổi sản lượng ra tiền (bảng lương, báo cáo sản lượng).
export function buildKpiRateMap(rates: { plantTypeId: string; stageCode: string; vndPerUnit: number }[]): Map<string, number> {
  const map = new Map(rates.map((r) => [`${r.plantTypeId}|${r.stageCode}`, r.vndPerUnit]));
  for (const [alias, source] of Object.entries(KPI_RATE_STAGE_ALIASES)) {
    for (const r of rates) {
      if (r.stageCode === source && !map.has(`${r.plantTypeId}|${alias}`)) map.set(`${r.plantTypeId}|${alias}`, r.vndPerUnit);
    }
  }
  return map;
}

// Số cây trong 1 túi theo quy cách — dùng để quy đổi số cây sang số túi (VD: T05 → chia 5)
export const FINISHED_SPEC_BAG_SIZE = {
  T01: 1,
  T05: 5,
  T10: 10,
  T06: 6,
  T20: 20,
  T25: 25,
} as const;

// Quy cách túi chỉ có khi NHẬP HÀNG từ NCC/khu sản xuất (không đóng gói ra trong hệ thống) — nhập vào kho
// rồi xuất bán luôn (đơn hàng nhận được) hoặc Xử lý cây đổi sang T01/T05/T10. Không phải đầu ra của bất
// kỳ chỉ định/phiếu xử lý nào (đầu ra vẫn chỉ FINISHED_SPEC_LABELS).
export const INBOUND_SPEC_LABELS = {
  T06: "T06 — túi 6 cây",
  T20: "T20 — túi 20 cây",
  T25: "T25 — túi 25 cây",
} as const;

// Thứ tự cột quy cách trên các bảng tồn kho thành phẩm (theo cỡ túi tăng dần).
export const FINISHED_STAGE_COLUMNS = ["T01", "T05", "T06", "T10", "T20", "T25"] as const;

// Mọi quy cách túi thành phẩm có thể có trong tồn kho/đơn hàng.
export const ALL_FINISHED_STAGE_CODES = [...Object.keys(FINISHED_SPEC_LABELS), ...Object.keys(INBOUND_SPEC_LABELS)] as (
  keyof typeof FINISHED_SPEC_LABELS | keyof typeof INBOUND_SPEC_LABELS
)[];

// Quy cách chậu (Phòng cây trồng, Kho thị trường) — gắn trên Lot.stageCode khi stage = THANH_PHAM, dùng
// riêng cho "Xuất cây" (Đối tác vận hành, xem src/lib/market-export.ts). Khác hẳn FINISHED_SPEC_LABELS
// (quy cách túi, Phòng sản phẩm đạt) — 1 chậu luôn tính là 1 cây (không có bagSize > 1 như túi).
// Nhãn để đúng mã S/M/L/X/Y/Z/C (không thêm chữ "Chậu") — khớp cột Quy cách ở trang Tồn kho Phòng cây trồng.
// Ý nghĩa từng mã xem POT_SPEC_DESCRIPTIONS (bảng quy cách Admin cấp cao chốt 21/10/2026).
export const POT_SPEC_LABELS = {
  S: "S",
  M: "M",
  L: "L",
  X: "X",
  Y: "Y",
  Z: "Z",
  C: "C",
} as const;
export const POT_SPEC_DESCRIPTIONS: Record<keyof typeof POT_SPEC_LABELS, string> = {
  S: "Size pot 1.7 inch",
  M: "Size pot 2,8 inch",
  L: "Size pot 3,5 inch",
  X: "Cutting size lá 20-30cm",
  Y: "Cutting size lá 31-40cm",
  Z: "Cutting size lá 40cm+",
  C: "Node thân đốt + lá mẹ",
};

// Nhãn hiển thị quy cách dùng chung cho MỌI dòng thành phẩm (túi lẫn chậu) — trả nguyên mã nếu không
// khớp nhãn nào (dữ liệu cũ/lạ), dùng ở trang Xuất cây thay vì chỉ tra FINISHED_SPEC_LABELS.
export function finishedStageLabel(stageCode: string): string {
  return (
    (FINISHED_SPEC_LABELS as Record<string, string>)[stageCode] ??
    (POT_SPEC_LABELS as Record<string, string>)[stageCode] ??
    stageCode
  );
}

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

// Đánh dấu Transfer bàn giao SẢN PHẨM R&D (mẫu mẹ hoặc thành phẩm) từ "Kho sản xuất R&D" sang 1 kho sản xuất
// THẬT khác (Admin kỹ thuật chọn đích, xem src/lib/rnd-warehouse-handover.ts) — khác
// MOTHER_WAREHOUSE_TRANSFER_TAG (đó là KHO_MO chuyển mẫu mẹ giữa 2 kho thật, nguồn luôn có giàn kệ thật,
// còn đây nguồn là Phòng tối cá nhân của Admin kỹ thuật, không qua giàn kệ nào).
export const RND_OUTPUT_TRANSFER_TAG = "RND_OUTPUT_TRANSFER";

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

// Nhãn thị trường của 1 đơn: thị trường thật (Order.salesMarket) nếu có, đơn cũ lùi về enum MARKET_LABELS.
export function orderMarketLabel(o: { market: keyof typeof MARKET_LABELS | null; salesMarket?: { name: string } | null }): string {
  return o.salesMarket?.name ?? (o.market ? MARKET_LABELS[o.market] : "—");
}

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
  KTP_WAITING_HANDOVER: "Chờ Kho TP bàn giao",
  KTP_HANDED_OVER: "Chờ Kho mô nhận",
  WAITING_RETURN_HANDOVER: "Chờ Kho mô bàn giao lại Kho TP",
  CREATED: "Chờ gán NV",
  ASSIGNED: "Chờ NV nhận bàn giao",
  IN_PROGRESS: "Đang xử lý",
  PENDING_PLACEMENT: "Chờ kiểm tra & sắp xếp",
  PENDING_RETURN: "Chờ Kho TP nhận lại",
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
  QLK_DE_XUAT_TUAN: "Đề xuất trồng/hủy tuần (Quản lý)",
} as const;

export const DAILY_TASK_STATUS_LABELS = {
  PENDING: "Chưa hoàn thành",
  COMPLETED: "Đã hoàn thành",
  CANCELLED: "Đã hủy",
} as const;

export const ALERT_TYPE_LABELS = {
  CONTAMINATION_HIGH: "Tỉ lệ nhiễm cao",
  OUTPUT_DEVIATION: "Lệch sản lượng",
  OUTPUT_DEVIATION_RESOLVED: "Kết quả đánh giá lệch sản lượng",
  OUTPUT_DEVIATION_STAFF_RESPONSE_NEEDED: "Cần phản hồi đánh giá lỗi cấy",
  OUTPUT_DEVIATION_DISAGREED: "NV cấy mô không đồng ý với đánh giá lỗi cấy",
  ORDER_EXPIRING: "Đơn sắp hết hạn",
  ORDER_EXPIRED: "Đơn hết hạn",
  STOCK_LOW: "Tồn kho thấp",
  LOT_READY_TRANSFER: "Lô sẵn sàng bàn giao",
  ORDER_PENDING_PACK: "Đơn chờ đóng gói",
  ORDER_EDITED: "Đơn hàng đã được sửa",
  PRICE_LIST_MONTHLY_DUE: "Nhắc cập nhật bảng giá tháng sau",
  PRICE_LIST_SUBMITTED: "Bảng giá mới chờ duyệt",
  PRICE_LIST_DECIDED: "Kết quả duyệt bảng giá",
  EXCHANGE_RATE_MONTHLY_DUE: "Nhắc cập nhật tỉ giá tháng sau",
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
  EXTRA_WORK_REQUEST: "Đăng kí làm thêm",
  ASSIGNED_TASK_COMPLETED: "Đã hoàn thành việc được giao",
  MOTHER_WAREHOUSE_TRANSFER_SHORTFALL: "Nhận thiếu mẫu mẹ bàn giao liên kho",
  MOTHER_WAREHOUSE_TRANSFER_INCOMING: "Phiếu bàn giao mẫu mẹ liên kho chờ nhận",
  NV_VIOLATION: "Vi phạm kiểm tra kho tối",
  CUSTOMER_STATUS_UPDATE_DUE: "Cần cập nhật tình trạng khách hàng",
  INSTRUCTION_RETURNED_UNHANDED: "Chỉ định cấy được hoàn lại",
  DE_XUAT_TRONG_HUY_WEEKLY_DUE: "Nhắc hạn Đề xuất trồng/hủy tuần",
  FINISHED_GOODS_WEEKLY_CHECK_SUBMITTED: "Phiếu kiểm tra kho cây tuần",
  KTP_REPACK_CREATED: "Phiếu xử lý từ Kho thành phẩm",
  KTP_REPACK_RETURNED: "Phiếu xử lý chờ Kho TP nhận lại",
  GARDEN_HANDOVER_CREATED: "Phiếu bàn giao về Vườn sản xuất",
  GARDEN_RECEIPT_CREATED: "Phiếu bàn giao cây mô về vườn",
  GARDEN_RECEIPT_DISCREPANCY: "Phiếu bàn giao cây về vườn bị lệch số lượng",
  GARDEN_RECEIPT_COMPLETED: "Vườn đã nhận đủ phiếu bàn giao cây",
  GARDEN_DAMAGE_SUBMITTED: "Phiếu ghi nhận cây hỏng chờ xác nhận",
  GARDEN_DAMAGE_RETURNED: "Phiếu ghi nhận cây hỏng bị trả lại",
  GARDEN_DAMAGE_CONFIRMED: "Phiếu ghi nhận cây hỏng đã xác nhận",
  GARDEN_CARE_SUBMITTED: "Phiếu chăm sóc cây mô chờ duyệt",
  GARDEN_CARE_RETURNED: "Phiếu chăm sóc cây mô bị trả lại",
  GARDEN_CARE_CONFIRMED: "Phiếu chăm sóc cây mô đã duyệt",
  RND_NEXT_ROUND_READY: "Kì cấy R&D tiếp theo đã sẵn sàng",
  MOTHER_FORECAST_MONTHLY_DUE: "Nhiệm vụ Dự kiến đáp ứng mẫu mẹ đến hạn",
  MOTHER_OUTPUT_SHORTFALL: "Sản lượng mẫu mẹ tụt dưới kế hoạch",
  MOTHER_FORECAST_EDIT_PROPOSAL: "Đề xuất chỉnh sửa kế hoạch mẫu mẹ",
  MOTHER_FORECAST_EDIT_APPROVED: "Đề xuất chỉnh sửa mẫu mẹ đã duyệt",
  MOTHER_FORECAST_EDIT_REJECTED: "Đề xuất chỉnh sửa mẫu mẹ bị từ chối",
  ROOTING_QUALITY_EVALUATION_DUE: "Đến hạn đánh giá chất lượng cây ra rễ",
  ROOTING_QUALITY_EVALUATION_READY: "Đã có kết quả đánh giá chất lượng cây ra rễ",
  PROBATION_EVALUATION_SELF_DUE: "Đến hạn tự đánh giá tuần thử việc",
  PROBATION_EVALUATION_MANAGER_DUE: "Đến lượt chấm điểm đánh giá thử việc",
  PROBATION_EVALUATION_COMPLETED: "Đã có kết quả đánh giá thử việc",
  REJECTED_GOODS_CLASSIFICATION_PENDING: "Cần phân loại hàng không đạt",
  REJECTED_GOODS_PROPOSAL_SUBMITTED: "Đề xuất phân loại hàng không đạt mới",
  REJECTED_GOODS_PROPOSAL_APPROVED: "Đề xuất phân loại hàng không đạt đã duyệt",
  ATTENDANCE_REQUEST: "Đơn chấm công cần duyệt",
  ATTENDANCE_REQUEST_DECIDED: "Kết quả đơn chấm công",
  STOCK_COUNT_SUBMITTED: "Báo cáo đối chiếu tồn kho mới",
  STOCK_COUNT_RECHECK_REQUESTED: "Yêu cầu kiểm tra lại tồn kho",
  STOCK_COUNT_APPLIED: "Đã áp số liệu đối chiếu tồn kho",
  STOCK_COUNT_DUE: "Đến hạn đối chiếu tồn kho cuối tháng",
  SALES_MANAGER_IMPORT_PENDING: "Phân công NV quản lý chờ duyệt",
  SALES_MANAGER_IMPORT_DECIDED: "Kết quả duyệt phân công NV quản lý",
  TRANSFER_RECEIVE_FEEDBACK: "Góp ý của Kho thành phẩm khi nhận hàng",
  INVOICE_APPROVAL_NEEDED: "Phiếu báo giá chờ duyệt giá",
  INVOICE_DECIDED: "Kết quả duyệt phiếu báo giá",
} as const;

// Trang đích khi bấm "Xem chi tiết" ở trang Thông báo cho 1 số loại thông báo có nơi xử lý cụ thể — bấm
// vào vừa đánh dấu đã xem vừa điều hướng thẳng tới đó, thay vì chỉ có nút "Đã xem" chung chung (xem
// alerts/page.tsx). Loại nào không có trong map này vẫn giữ nút "Đã xem" như cũ.
export const ALERT_DETAIL_LINKS: Partial<Record<keyof typeof ALERT_TYPE_LABELS, string>> = {
  ORDER_EDITED: "/orders/list",
  PRICE_LIST_MONTHLY_DUE: "/price-lists",
  PRICE_LIST_SUBMITTED: "/price-lists",
  PRICE_LIST_DECIDED: "/price-lists",
  EXCHANGE_RATE_MONTHLY_DUE: "/exchange-rates",
  INVOICE_APPROVAL_NEEDED: "/invoices",
  INVOICE_DECIDED: "/invoices",
  CONTAMINATION_PROPOSAL: "/production-management?tab=contamination",
  OUTPUT_DEVIATION_STAFF_RESPONSE_NEEDED: "/output-deviation-response",
  REJECTED_GOODS_CLASSIFICATION_PENDING: "/market-receive/reject-classification",
  REJECTED_GOODS_PROPOSAL_SUBMITTED: "/reject-classification",
  REJECTED_GOODS_PROPOSAL_APPROVED: "/market-receive/reject-classification",
  MOTHER_WAREHOUSE_TRANSFER_INCOMING: "/handover-in?tab=mother-stock",
  ATTENDANCE_REQUEST: "/attendance/approvals",
  ATTENDANCE_REQUEST_DECIDED: "/attendance?tab=requests",
  STOCK_COUNT_SUBMITTED: "/stock-counts",
  STOCK_COUNT_RECHECK_REQUESTED: "/stock-counts",
  STOCK_COUNT_APPLIED: "/stock-counts",
  STOCK_COUNT_DUE: "/stock-counts",
  SALES_MANAGER_IMPORT_PENDING: "/settings/sale/managers",
  SALES_MANAGER_IMPORT_DECIDED: "/settings/sale/managers",
  ROOTING_QUALITY_EVALUATION_READY: "/reports/rooting-quality-evaluations",
  FINISHED_GOODS_WEEKLY_CHECK_SUBMITTED: "/task-assignment",
  KTP_REPACK_CREATED: "/handover-in?tab=ktp-repack",
  KTP_REPACK_RETURNED: "/goods-receipts?tab=repack",
  GARDEN_HANDOVER_CREATED: "/garden-handovers",
  GARDEN_RECEIPT_CREATED: "/garden-receipts",
  GARDEN_RECEIPT_DISCREPANCY: "/garden-receipts",
  GARDEN_RECEIPT_COMPLETED: "/garden-receipts",
  GARDEN_DAMAGE_SUBMITTED: "/garden-damage",
  GARDEN_DAMAGE_RETURNED: "/garden-damage",
  GARDEN_DAMAGE_CONFIRMED: "/garden-damage",
  GARDEN_CARE_SUBMITTED: "/garden-care",
  GARDEN_CARE_RETURNED: "/garden-care",
  GARDEN_CARE_CONFIRMED: "/garden-care",
};

// Loại cảnh báo hiện trong widget "Cảnh báo chưa đọc" ở Dashboard tổng quan — theo TỪNG vai trò Admin
// (SUPER_ADMIN/ADMIN/ADMIN_KY_THUAT), không phải lấy nguyên trạng thái UNREAD gần nhất bất kỳ như trước
// (xem getAdminStats, dashboard/page.tsx) — người dùng tự chốt danh sách theo từng vai trò cần quan tâm
// gì, KHÔNG cần khớp với targetRole/userId thật của Alert (nhiều loại ở đây vốn gửi cá nhân cho NV khác,
// Admin chỉ xem để giám sát, không phải người xử lý — widget này chỉ hiển thị, không có nút xử lý).
export const ADMIN_DASHBOARD_ALERT_TYPES: Record<"SUPER_ADMIN" | "ADMIN" | "ADMIN_KY_THUAT", AlertType[]> = {
  SUPER_ADMIN: [
    "CONTAMINATION_HIGH", "OUTPUT_DEVIATION", "OUTPUT_DEVIATION_RESOLVED", "OUTPUT_DEVIATION_DISAGREED", "ORDER_PROCESSING_SHORTFALL", "ORDER_EXPIRING", "ORDER_EXPIRED",
    "STOCK_LOW", "LOT_READY_TRANSFER", "ORDER_PENDING_PACK", "MEDIUM_HANDOVER_READY", "ROOTING_LOT_READY",
    "CONTAMINATION_PROPOSAL", "INSPECTION_RESULT_READY", "ACCOUNT_LOCKED", "PASSWORD_RESET_REQUESTED",
    "MOTHER_CONTAMINATION_HIGH", "MOTHER_WAREHOUSE_TRANSFER_SHORTFALL", "MOTHER_WAREHOUSE_TRANSFER_INCOMING", "NV_VIOLATION", "CUSTOMER_STATUS_UPDATE_DUE",
    "ROOTING_FORECAST_MONTHLY_DUE", "ROOTING_FORECAST_EDIT_PROPOSAL",
    "MOTHER_FORECAST_MONTHLY_DUE", "MOTHER_OUTPUT_SHORTFALL", "MOTHER_FORECAST_EDIT_PROPOSAL",
    "ROOTING_QUALITY_EVALUATION_DUE", "ROOTING_QUALITY_EVALUATION_READY",
    "SALES_MANAGER_IMPORT_PENDING", "GARDEN_RECEIPT_DISCREPANCY",
  ],
  ADMIN: [
    "ORDER_PROCESSING_SHORTFALL", "ORDER_EXPIRING", "ORDER_EXPIRED", "STOCK_LOW", "ORDER_PENDING_PACK",
    "CONTAMINATION_PROPOSAL", "MOTHER_WAREHOUSE_TRANSFER_SHORTFALL", "NV_VIOLATION", "CUSTOMER_STATUS_UPDATE_DUE",
  ],
  ADMIN_KY_THUAT: [
    "CONTAMINATION_HIGH", "OUTPUT_DEVIATION", "OUTPUT_DEVIATION_RESOLVED", "OUTPUT_DEVIATION_DISAGREED", "LOT_READY_TRANSFER", "MEDIUM_HANDOVER_READY", "INSPECTION_RESULT_READY",
    "MOTHER_CONTAMINATION_HIGH", "MOTHER_WAREHOUSE_TRANSFER_SHORTFALL", "MOTHER_WAREHOUSE_TRANSFER_INCOMING", "NV_VIOLATION", "ROOTING_FORECAST_MONTHLY_DUE",
    "MOTHER_FORECAST_MONTHLY_DUE", "MOTHER_OUTPUT_SHORTFALL", "MOTHER_FORECAST_EDIT_PROPOSAL",
    "ROOTING_QUALITY_EVALUATION_DUE", "ROOTING_QUALITY_EVALUATION_READY",
  ],
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

// CAY_THEM/HAN_TUI là 2 lựa chọn hiện tại (xem ExtraWorkPurpose, prisma/schema.prisma) — 2 giá trị còn
// lại là lịch sử cũ, giữ nhãn để hiển thị đúng các đăng ký cũ, không còn chọn được khi tạo mới.
export const EXTRA_WORK_PURPOSE_LABELS = {
  COMPLETE_MAIN_INSTRUCTION: "Để hoàn thành chỉ định cấy chính được giao trong tuần",
  INCREASE_OUTPUT: "Để gia tăng sản lượng",
  CAY_THEM: "Đăng ký cấy thêm cây",
  HAN_TUI: "Đăng ký hàn túi",
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
  MOTHER_STOCK_TO_CONTAMINATION: "Kho mô chuyển mẫu mẹ từ kho sáng xuống",
} as const;

// staffId "giả" trong ContaminationStaffBalance/ContaminationProposal cho phần nhiễm thuộc "Kho nhiễm
// chung" (= Phòng nhiễm của kho) do Kho mô tự chuyển mẫu mẹ từ kho sáng xuống — không gắn NV cấy mô nào,
// tách riêng khỏi bucket "" (tồn cũ/không rõ NV) để Kho mô đề xuất trồng/hủy riêng. Không phải id User thật.
export const COMMON_CONTAMINATION_STAFF_ID = "KHO_NHIEM_CHUNG";
export const COMMON_CONTAMINATION_LABEL = "Kho nhiễm chung";

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

// Màu badge tương ứng, dùng chung ở reports/output-deviation và my-reports.
export const DEVIATION_CAUSE_COLORS: Record<keyof typeof DEVIATION_CAUSE_LABELS, string> = {
  KY_THUAT_SAI: "bg-warning-light text-warning-foreground",
  CAY_MO_SAI: "bg-danger-light text-destructive",
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
    { href: "/garden-handovers", label: "Bàn giao cây về Vườn", icon: "PackageCheck" },
    { href: "/garden-receipts", label: "Phiếu bàn giao cây mô về vườn", icon: "Sprout" },
    { href: "/quality-monitoring", label: "Giám sát & vi phạm", icon: "ShieldAlert" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/rooting-forecast-requests", label: "Duyệt đề xuất cây ra rễ", icon: "PackageCheck" },
    { href: "/mother-forecast-requests", label: "Duyệt đề xuất mẫu mẹ", icon: "PackageCheck" },
    { href: "/transfers/handover-history", label: "Lịch sử phiếu bàn giao", icon: "History" },
    { href: "/instructions/edit", label: "Sửa chỉ định cấy", icon: "PenLine" },
    { href: "/settings/data-import", label: "Nhập liệu trực tiếp", icon: "UploadCloud" },
    { href: "/mother-photo-update/view", label: "Xem dữ liệu hình ảnh", icon: "Images" },
    { href: "/settings", label: "Cài đặt", icon: "Settings" },
    { href: "/price-lists", label: "Bảng giá tháng", icon: "DollarSign" },
    { href: "/exchange-rates", label: "Tỉ giá tháng", icon: "TrendingUp" },
    { href: "/invoices", label: "Phiếu báo giá", icon: "Wallet" },
    { href: "/attendance/manage", label: "Bảng chấm công", icon: "CalendarCheck" },
    { href: "/attendance/approvals", label: "Duyệt đơn chấm công", icon: "ClipboardCheck" },
    { href: "/assistant-tasks", label: "Theo dõi công việc", icon: "ListChecks" },
    { href: "/stock-counts", label: "Đối chiếu tồn kho cuối tháng", icon: "ClipboardCheck" },
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
  // Admin kỹ thuật — y hệt ADMIN ở trên, TRỪ 4 mục: Cài đặt CSDL chung hệ thống, Giám sát & vi phạm, Duyệt
  // đề xuất cây ra rễ, Sửa cập nhật dữ liệu cấy (chặn thêm ngay tại page.tsx của các trang đó dù
  // isAdminRole trả về true cho role này — xem comment UserRole.ADMIN_KY_THUAT ở schema.prisma). Có thêm
  // mục R&D (/rnd) riêng + "Duyệt đề xuất mẫu mẹ" (KHÁC "Duyệt đề xuất cây ra rễ" — mục này ADMIN_KY_THUAT
  // LÀ người duyệt được, xem comment MotherForecastEditProposal ở schema.prisma).
  ADMIN_KY_THUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/users", label: "Người dùng", icon: "Users" },
    { href: "/production-management", label: "Quản lý Khu sản xuất", icon: "Factory" },
    { href: "/inventory/kho-sang", label: "Phòng sáng", icon: "Sun" },
    // Cho phép Admin kỹ thuật tự nhập lô mẫu mẹ ĐẦU TIÊN cho mã cây vừa tạo ở "Quản lý loại cây" (mã mới
    // chưa có lô nào thì không hiện được khi tạo chỉ định cấy, vốn chọn theo giàn kệ ĐANG CÓ mẫu mẹ, không
    // chọn thẳng từ danh mục) — trang /inventory/nhap-kho đã hỗ trợ sẵn mọi role Admin (isAdminRole, xem
    // nhap-kho-content.tsx), trước đây chỉ thiếu link menu cho ADMIN_KY_THUAT.
    { href: "/inventory/nhap-kho", label: "Nhập kho thủ công", icon: "PackagePlus" },
    { href: "/report-center", label: "Báo cáo", icon: "BarChart3" },
    { href: "/instructions/list", label: "Chỉ định cấy đã tạo", icon: "ClipboardList" },
    { href: "/mother-forecast-requests", label: "Duyệt đề xuất mẫu mẹ", icon: "PackageCheck" },
    { href: "/rnd", label: "R&D", icon: "FlaskConical" },
    { href: "/rnd-production", label: "Cấy sản xuất R&D", icon: "Sprout" },
    { href: "/rnd-handover", label: "Bàn giao", icon: "Send" },
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
    { href: "/reports/production-record", label: "Số lượng ghi nhận", icon: "Boxes" },
    { href: "/reports/production-capacity", label: "Năng lực sản xuất", icon: "Gauge" },
    { href: "/rooting-forecast", label: "Dự kiến đáp ứng cây ra rễ", icon: "Sprout" },
    { href: "/mother-forecast", label: "Dự kiến đáp ứng mẫu mẹ", icon: "Layers" },
    { href: "/reports/rooting-plan-vs-actual", label: "Kế hoạch vs thực tế cây ra rễ", icon: "Gauge" },
    { href: "/reports/inspection-lane", label: "Phân loại luồng kiểm tra", icon: "Flag" },
    { href: "/reports/inspection-defects", label: "Phiếu kiểm tra không đạt/nhiễm", icon: "AlertTriangle" },
    { href: "/reports/inventory-lifecycle", label: "Quá hạn", icon: "Package" },
    { href: "/reports/output-deviation", label: "Lệch chỉ định & nguyên nhân", icon: "AlertTriangle" },
    { href: "/rooting-quality-evaluation", label: "Đánh giá chất lượng cây ra rễ", icon: "ClipboardCheck" },
    { href: "/reports/rooting-quality-evaluations", label: "Báo cáo đánh giá chất lượng ra rễ", icon: "ClipboardCheck" },
    { href: "/probation-evaluations", label: "Đánh giá thử việc", icon: "ClipboardCheck" },
    { href: "/planting-error-types", label: "Phân loại lỗi cấy", icon: "Tags" },
    { href: "/attendance", label: "Chấm công", icon: "Fingerprint" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // "Lộ trình đào tạo" chỉ HIỆN THẬT SỰ khi employmentType = THU_VIEC (lọc động ở DashboardLayout, xem
  // src/app/(dashboard)/layout.tsx) — vẫn khai báo cố định ở đây để lên đúng danh mục trang của ma trận
  // phân quyền (PermissionMatrix gộp từ ROLE_NAV) và để isPageAllowed hoạt động bình thường.
  CAY_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/my-instructions", label: "Chỉ định của tôi", icon: "ClipboardList" },
    { href: "/output-deviation-response", label: "Phản hồi đánh giá lệch cấy", icon: "ShieldAlert" },
    { href: "/daily-record", label: "Nhập dữ liệu cấy", icon: "PenLine" },
    { href: "/extra-work", label: "Đăng ký làm thêm việc", icon: "CalendarPlus" },
    { href: "/my-dark-room", label: "Phòng tối cá nhân", icon: "Moon" },
    { href: "/product-handover", label: "Bàn giao sản phẩm", icon: "Send" },
    { href: "/handover-record", label: "Ghi nhận bàn giao", icon: "PackageCheck" },
    { href: "/my-reports", label: "Báo cáo cá nhân", icon: "BarChart3" },
    { href: "/training-roadmap", label: "Lộ trình đào tạo", icon: "GraduationCap" },
    { href: "/probation-evaluations", label: "Đánh giá thử việc", icon: "ClipboardCheck" },
    { href: "/attendance", label: "Chấm công", icon: "Fingerprint" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KHO_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/garden-receipts", label: "Bàn giao cây mô về vườn", icon: "Sprout" },
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
    { href: "/reports/rooting-plan-vs-actual", label: "Kế hoạch vs thực tế cây ra rễ", icon: "Gauge" },
    { href: "/reports/inspection-lane", label: "Phân loại luồng kiểm tra", icon: "Flag" },
    { href: "/reports/inspection-defects", label: "Phiếu kiểm tra không đạt/nhiễm", icon: "AlertTriangle" },
    { href: "/reports/inventory-lifecycle", label: "Quá hạn", icon: "Package" },
    { href: "/reports/output-deviation", label: "Lệch chỉ định & nguyên nhân", icon: "AlertTriangle" },
    // Gộp "Nhập kho thủ công" + "Gán mã cây & NV mẫu mẹ" + "Cài đặt luồng kiểm tra" vào hub này (xem
    // manual-settings/page.tsx) — 3 route cũ vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/manual-settings", label: "Cài đặt thủ công", icon: "Settings" },
    { href: "/mother-stock-reshelf", label: "Sắp xếp kho mẫu mẹ", icon: "ArrowLeftRight" },
    // Gộp "Bàn giao mẫu mẹ" (giàn Phòng mẫu mẹ → kho sản xuất khác) + "Bàn giao thành phẩm"
    // (/transfers/finished) + "Bàn giao cây trồng" (/replant-handovers) vào hub này (xem
    // handover-out/page.tsx) — 2 route sau vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/handover-out", label: "Bàn giao liên kho", icon: "Send" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    // Gộp "Nhận bàn giao mẫu mẹ" + "Nhận bàn giao môi trường" (/medium-orders/receive) + "Nhận bàn giao
    // R&D" (/rnd-warehouse-handover) vào hub này (xem handover-in/page.tsx) — 2 route sau vẫn hoạt động
    // độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/handover-in", label: "Nhận bàn giao liên kho", icon: "PackageCheck" },
    // "Báo cáo tỉ lệ nhiễm" gộp vào tab trong hub này (xem violation-report/page.tsx) — route
    // /reports/mother-contamination vẫn hoạt động độc lập, chỉ bỏ khỏi menu dọc KHO_MO.
    { href: "/violation-report", label: "Báo cáo vi phạm", icon: "AlertTriangle" },
    { href: "/extra-work-requests", label: "Đăng kí làm thêm", icon: "CalendarPlus" },
    { href: "/reports/rooting-quality-evaluations", label: "Dự kiến hàng ra rễ về Kho TP", icon: "ClipboardCheck" },
    { href: "/attendance", label: "Chấm công", icon: "Fingerprint" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // NV Trợ lý — kiểm tra/ghi nhận lỗi vi phạm NV cấy mô giống Kho mô (cùng phạm vi kho làm việc) + Theo dõi công việc.
  TRO_LY: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/assistant-tasks", label: "Theo dõi công việc", icon: "ListChecks" },
    { href: "/violation-report", label: "Báo cáo vi phạm", icon: "AlertTriangle" },
    { href: "/attendance", label: "Chấm công", icon: "Fingerprint" },
    // Khách hàng + NV quản lý đủ quyền; Thị trường chỉ xem — xem canManageSaleCustomers/canEditSaleMarkets.
    { href: "/settings/sale/customers", label: "Cài đặt Sale", icon: "Flag" },
    { href: "/price-lists", label: "Bảng giá tháng", icon: "DollarSign" },
    { href: "/stock-counts", label: "Đối chiếu tồn kho cuối tháng", icon: "ClipboardCheck" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // "Nhận hàng" (/goods-receipts) gộp cả "Nhận hàng từ NCC" lẫn "Nhận bàn giao thành phẩm" (route
  // /transfers/receive cũ đã xoá, nội dung chuyển vào TransferReceiveBoard trong trang này) — chỉ còn 1
  // mục menu duy nhất cho cả 2 luồng nhận hàng.
  KHO_THANH_PHAM: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/transfers/send", label: "Trả hàng Kho Sản xuất", icon: "PackageOpen" },
    { href: "/garden-receipts", label: "Bàn giao cây mô về vườn", icon: "Sprout" },
    { href: "/ktp-handover-out", label: "Bàn giao liên kho", icon: "Send" },
    { href: "/transfers/send-market", label: "Gửi hàng Kho thị trường", icon: "Send" },
    { href: "/inventory/dat-tieu-chuan", label: "Xem tồn đạt tiêu chuẩn", icon: "PackageCheck" },
    { href: "/inventory/thanh-pham", label: "Xem tồn thực tế", icon: "Package" },
    { href: "/goods-receipts", label: "Nhận hàng", icon: "Truck" },
    { href: "/rnd-warehouse-handover", label: "Nhận bàn giao R&D", icon: "FlaskConical" },
    { href: "/orders/pack", label: "Sắp xếp đơn hàng", icon: "PackageOpen" },
    { href: "/shipping", label: "Xuất hàng", icon: "Send" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/attendance", label: "Chấm công", icon: "Fingerprint" },
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
    // Phiếu xử lý gửi Kho mô khu sản xuất (từ Phòng chờ xử lý) — trước đây là việc tuần "Phiếu xử lý".
    { href: "/ktp-repack", label: "Tạo phiếu xử lý", icon: "RefreshCw" },
    // Chuyển cây qua lại Phòng đạt tiêu chuẩn ⇄ Phòng chờ xử lý trong cùng kho (xem /room-moves).
    { href: "/room-moves", label: "Luân chuyển nội bộ", icon: "ArrowLeftRight" },
    { href: "/ktp-handover-out", label: "Bàn giao liên kho", icon: "Send" },
    { href: "/transfers/send-market", label: "Gửi hàng Kho thị trường", icon: "Send" },
    { href: "/inventory", label: "Xem tồn kho", icon: "Warehouse" },
    { href: "/goods-receipts", label: "Nhận hàng", icon: "Truck" },
    { href: "/rnd-warehouse-handover", label: "Nhận bàn giao R&D", icon: "FlaskConical" },
    { href: "/processing", label: "Xử lý cây", icon: "Recycle" },
    { href: "/orders", label: "Xử lý đơn hàng", icon: "ShoppingCart" },
    { href: "/invoices", label: "Phiếu báo giá", icon: "Wallet" },
    { href: "/shipping", label: "Xuất hàng", icon: "Send" },
    { href: "/reports/inventory-flow-summary", label: "Báo cáo Nhập - Xuất", icon: "BarChart3" },
    { href: "/reports/rooting-quality-evaluations", label: "Dự kiến hàng ra rễ về Kho TP", icon: "ClipboardCheck" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/garden-handovers", label: "Bàn giao cây về Vườn", icon: "Sprout" },
    // Phiếu bàn giao cây mô về Vườn sản xuất (lập tay, chọn vườn nhận) — xem /garden-receipts.
    { href: "/garden-receipts", label: "Bàn giao cây mô về vườn", icon: "Sprout" },
    { href: "/attendance", label: "Chấm công", icon: "Fingerprint" },
    { href: "/stock-counts", label: "Đối chiếu tồn kho cuối tháng", icon: "ClipboardCheck" },
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
    { href: "/invoices", label: "Phiếu báo giá", icon: "Wallet" },
    { href: "/price-lists", label: "Bảng giá tháng", icon: "DollarSign" },
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
    { href: "/reports/production-output", label: "Sản lượng ghi nhận", icon: "Boxes" },
    { href: "/reports/probation-evaluations", label: "Báo cáo đánh giá thử việc", icon: "ClipboardCheck" },
    { href: "/attendance/manage", label: "Bảng chấm công", icon: "CalendarCheck" },
    { href: "/attendance/approvals", label: "Duyệt đơn chấm công", icon: "ClipboardCheck" },
    { href: "/stock-counts", label: "Đối chiếu tồn kho cuối tháng", icon: "ClipboardCheck" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  NHAN_VIEN_SAN_XUAT: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/replant-handovers", label: "Nhận bàn giao cây trồng", icon: "PackageCheck" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Chưa có trang nghiệp vụ riêng (xem Vườn sản xuất được gán ở /production-gardens, chỉ SUPER_ADMIN
  // sửa) — menu tối thiểu, mở rộng sau nếu NVQLV cần tự thao tác trên Vườn của mình.
  // NV chăm sóc cây mô (Vườn sản xuất) — lập/gửi phiếu ghi nhận cây hỏng (xem /garden-damage).
  NV_CHAM_SOC_CAY_MO: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/garden-damage", label: "Phiếu ghi nhận cây hỏng", icon: "ClipboardCheck" },
    { href: "/garden-care", label: "Chăm sóc cây mô", icon: "Sprout" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  NHAN_VIEN_QUAN_LY_VUON: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/garden-handovers", label: "Nhận cây từ Kho thành phẩm", icon: "PackageCheck" },
    // Nhận bàn giao cây mô (Kho TP/Khu sản xuất lập phiếu) — giao kiểm đếm, nhập số thực nhận; xem /garden-receipts.
    { href: "/garden-receipts", label: "Nhận bàn giao cây mô", icon: "PackageCheck" },
    { href: "/garden-stock", label: "Tồn kho vườn", icon: "Boxes" },
    // Phân loại cây & ghi nhận cây hỏng (Luồng A nhiễm / Luồng B khỏe) — xác nhận phiếu NV gửi, xem /garden-damage.
    { href: "/garden-damage", label: "Phiếu ghi nhận cây hỏng", icon: "ClipboardCheck" },
    // Nghiệp vụ 4 — lô chăm sóc cây mô: sắp xếp vị trí, duyệt cây hỏng/đạt size S, xem /garden-care.
    { href: "/garden-care", label: "Chăm sóc cây mô", icon: "Sprout" },
    // Cài đặt nhân viên làm việc tại vườn (không có tài khoản), xem /garden-staff.
    { href: "/garden-staff", label: "Nhân sự vườn", icon: "Users" },
    // Nhà lưới → Giàn kệ → Dãy (mã vị trí VD 1A1), xem /garden-layout.
    { href: "/garden-layout", label: "Bố trí vườn", icon: "LayoutGrid" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Nhận hàng gửi từ Kho thành phẩm (xem /transfers/send-market, KHO_THANH_PHAM/QUAN_LY_KHO_THANH_PHAM) —
  // nhập số lượng thực nhận, chia vào Phòng sản phẩm đạt/không đạt (/market-receive).
  DOI_TAC_VAN_HANH: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/market-receive", label: "Nhận hàng", icon: "PackageCheck" },
    { href: "/market-receive/reject-classification", label: "Phân loại hàng không đạt", icon: "ClipboardCheck" },
    { href: "/inventory/thi-truong", label: "Tồn kho", icon: "Boxes" },
    { href: "/market-export", label: "Xuất cây", icon: "Send" },
    { href: "/contamination-proposals", label: "Đề xuất Trồng/Hủy", icon: "AlertTriangle" },
    { href: "/reports/partner", label: "Báo cáo", icon: "BarChart3" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // NV Kế toán — chưa giao nhiệm vụ nào, menu tối thiểu (giống NHAN_VIEN_QUAN_LY_VUON); thêm trang khi có
  // yêu cầu nghiệp vụ cụ thể.
  KE_TOAN: [
    { href: "/dashboard", label: "Tổng quan", icon: "LayoutDashboard" },
    { href: "/exchange-rates", label: "Tỉ giá tháng", icon: "DollarSign" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  // Dự án hoa lan — mọi role hoa lan KHÔNG có "/dashboard" (proxy.ts chuyển thẳng /dashboard về trang chủ
  // riêng, xem ORCHID_SCOPED_HOME) và không vào được bất kỳ trang nội bộ nào khác.
  ADMIN_HOA_LAN: [
    { href: "/orchid", label: "Dự án hoa lan", icon: "Flower2" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  TRO_LY_HOA_LAN: [
    { href: "/orchid", label: "Dự án hoa lan", icon: "Flower2" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  KHACH_HANG_LAN: [
    { href: "/orchid-shop", label: "Sản phẩm", icon: "Flower2" },
    { href: "/orchid-shop/cart", label: "Giỏ hàng", icon: "ShoppingCart" },
    { href: "/orchid-shop/orders", label: "Đơn hàng của tôi", icon: "ClipboardList" },
    { href: "/orchid-shop/debt", label: "Công nợ & lịch sử mua", icon: "Wallet" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
  DIEM_BAN_LAN: [
    { href: "/orchid-point", label: "Tổng quan điểm bán", icon: "Store" },
    { href: "/orchid-point/receive", label: "Nhận hàng", icon: "PackageCheck" },
    { href: "/orchid-point/sales", label: "Bán hàng & doanh thu", icon: "DollarSign" },
    { href: "/orchid-point/damage", label: "Báo cây hỏng", icon: "AlertTriangle" },
    { href: "/orchid-point/stock", label: "Báo số cây còn", icon: "Boxes" },
    { href: "/account", label: "Tài khoản", icon: "UserCircle" },
  ],
};

// ============================================================
// DỰ ÁN HOA LAN
// ============================================================

// Mọi role của Dự án hoa lan chỉ được vào đúng khu riêng (xem proxy guard ở src/lib/auth.config.ts) — mọi
// trang/API nội bộ khác đều bị chặn kể cả khi API đó chỉ check "đã đăng nhập". apiPrefix = API được gọi.
export const ORCHID_SCOPED_HOME: Partial<Record<UserRole, { home: string; apiPrefix: string }>> = {
  ADMIN_HOA_LAN: { home: "/orchid", apiPrefix: "/api/orchid" },
  TRO_LY_HOA_LAN: { home: "/orchid", apiPrefix: "/api/orchid" },
  KHACH_HANG_LAN: { home: "/orchid-shop", apiPrefix: "/api/orchid/shop" },
  DIEM_BAN_LAN: { home: "/orchid-point", apiPrefix: "/api/orchid/point" },
};
export function isOrchidScopedRole(role: UserRole | null | undefined): boolean {
  return !!role && !!ORCHID_SCOPED_HOME[role];
}
// Admin hoa lan: toàn quyền module. Trợ lý hoa lan: vận hành (khách, đơn, nhập/xuất, tồn, thanh toán, công
// nợ, hoá đơn, điểm bán) — KHÔNG có Chi phí/Báo cáo/Cấu hình (xem canManageOrchidAdminOnly). Admin cấp cao/NV
// Trợ lý của hệ thống cây mô KHÔNG có quyền vào Dự án hoa lan.
export function canAccessOrchidAdmin(role: UserRole | null | undefined): boolean {
  return role === "ADMIN_HOA_LAN" || role === "TRO_LY_HOA_LAN";
}
export function canManageOrchidAdminOnly(role: UserRole | null | undefined): boolean {
  return role === "ADMIN_HOA_LAN";
}
