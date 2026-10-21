import { z } from "zod";

// Mẫu thông tin công ty in trên invoice (CompanyProfile) — xem /api/company-profiles.
export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên công ty"),
  address: z.string().trim().min(1, "Nhập địa chỉ"),
  email: z.string().trim().min(1, "Nhập email"),
  phone: z.string().trim().optional().nullable(),
  taxCode: z.string().trim().optional().nullable(),
  bankInfo: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
