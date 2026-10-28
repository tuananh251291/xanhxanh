import { z } from "zod";

// Schema nhập liệu + include dùng chung cho POST /api/assistant-tasks và PATCH /api/assistant-tasks/[id]
// (route.ts của Next.js không được export thêm gì ngoài các hàm GET/POST/...).
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const assistantTaskSchema = z
  .object({
    category: z.enum(["CO_DINH", "PHAT_SINH"], { message: "Chọn phân loại" }),
    title: z.string().trim().min(1, "Nhập công việc").max(2000),
    responsibleId: z.string().min(1, "Chọn người chịu trách nhiệm"),
    assignedDate: z.string().regex(DATE, "Chọn ngày bàn giao"),
    deadline: z.string().regex(DATE, "Chọn deadline"),
    status: z.enum(["CHUA_LAM", "DANG_XU_LY", "HOAN_THANH"]).default("CHUA_LAM"),
    blocker: z.string().trim().max(2000).optional().nullable(),
    repeat: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).default("NONE"),
    // Chỉ dùng với WEEKLY — 1 = Thứ 2 … 7 = Chủ nhật.
    repeatWeekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  })
  .refine((d) => d.deadline >= d.assignedDate, { message: "Deadline không được trước ngày bàn giao", path: ["deadline"] });

export const assistantTaskInclude = {
  responsible: { select: { id: true, name: true, code: true, role: true } },
  createdBy: { select: { name: true } },
} as const;
