import { z } from "zod";

// Nhãn vị trí nhân sự vườn (GardenStaffType) — dùng chung client/server, tách khỏi garden-staff.ts (có prisma).
export const GARDEN_STAFF_TYPE_LABELS = {
  PHAN_LOAI: "Nhân viên phân loại",
  CHAM_SOC_CAY_MO: "Nhân viên chăm sóc cây mô",
  CHAM_SOC_CAY_THANH_PHAM: "Nhân viên chăm sóc cây thành phẩm",
  DONG_HANG: "Nhân viên đóng hàng",
} as const;

export type GardenStaffTypeKey = keyof typeof GARDEN_STAFF_TYPE_LABELS;
export const GARDEN_STAFF_TYPES = Object.keys(GARDEN_STAFF_TYPE_LABELS) as GardenStaffTypeKey[];

// Validate thêm/sửa nhân sự vườn — dùng chung POST /api/garden-staff và PATCH /api/garden-staff/[id].
export const gardenStaffSchema = z.object({
  name: z.string().trim().min(1, "Cần nhập họ tên").max(100),
  phone: z.string().trim().max(20).optional(),
  types: z.array(z.enum(["PHAN_LOAI", "CHAM_SOC_CAY_MO", "CHAM_SOC_CAY_THANH_PHAM", "DONG_HANG"])).min(1, "Chọn ít nhất 1 vị trí"),
  notes: z.string().trim().max(500).optional(),
  // Tài khoản đăng nhập (chỉ NV có vị trí Chăm sóc cây mô, user role NV_CHAM_SOC_CAY_MO). "" = gỡ liên kết.
  userId: z.string().optional(),
});
