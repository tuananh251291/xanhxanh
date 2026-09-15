import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { getTaskMonth } from "@/lib/mother-forecast";
import { z } from "zod";

// Ai duyệt được đề xuất mẫu mẹ — KHÁC đề xuất cây ra rễ (chỉ ADMIN/SUPER_ADMIN, chặn ADMIN_KY_THUAT): ở
// đây Admin KỸ THUẬT + Admin cấp cao duyệt được (không có ADMIN thường), vì đây thuần là số liệu sản
// xuất/kỹ thuật — xem comment MotherForecastEditProposal (prisma/schema.prisma).
function canReviewMotherForecast(role: string | null | undefined) {
  return role === "ADMIN_KY_THUAT" || role === "SUPER_ADMIN";
}

const itemSelect = {
  id: true, plantTypeId: true, quantity1: true, quantity2: true, quantity3: true, assignedStaffId: true,
  plantType: { select: { code: true, name: true } },
  assignedStaff: { select: { code: true, name: true } },
} as const;

const proposalSelect = {
  id: true, taskMonth: true, reason: true, status: true, rejectionReason: true,
  createdAt: true, reviewedAt: true,
  warehouse: { select: { code: true, name: true } },
  requestedBy: { select: { code: true, name: true } },
  reviewedBy: { select: { code: true, name: true } },
  items: { select: itemSelect },
} as const;

// Đề xuất chỉnh sửa "Dự kiến đáp ứng mẫu mẹ" — CHỈ gửi được sau khi đã khoá (đã nộp lần đầu, xem POST
// /api/mother-forecast/submit). Admin kỹ thuật/Admin cấp cao duyệt/từ chối qua PATCH .../[id].
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KY_THUAT" && !canReviewMotherForecast(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposals = await prisma.motherForecastEditProposal.findMany({
    where: role === "KY_THUAT" ? { requestedById: session!.user!.id } : {},
    select: proposalSelect,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(proposals);
}

const itemSchema = z.object({
  plantTypeId: z.string().min(1),
  assignedStaffId: z.string().min(1),
  quantity1: z.number().int().min(0),
  quantity2: z.number().int().min(0),
  quantity3: z.number().int().min(0),
});
const createSchema = z.object({
  reason: z.string().trim().min(1, "Cần nhập lý do"),
  items: z.array(itemSchema).min(1, "Cần điền ít nhất 1 dòng"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Chỉ áp dụng cho NV Kỹ thuật" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Chưa được Admin cấp cao gán cơ sở sản xuất" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { reason, items } = parsed.data;

  const taskMonth = getTaskMonth();
  const submission = await prisma.motherForecastSubmission.findUnique({ where: { warehouseId_taskMonth: { warehouseId, taskMonth } } });
  if (!submission) {
    return NextResponse.json({ message: "Chưa nộp lần đầu — dùng nút Lưu tất cả thay vì gửi đề xuất chỉnh sửa" }, { status: 400 });
  }

  const [plantTypes, staffList] = await Promise.all([
    prisma.plantType.findMany({ where: { id: { in: items.map((i) => i.plantTypeId) }, isActive: true }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: items.map((i) => i.assignedStaffId) }, role: "CAY_MO", isActive: true }, select: { id: true } }),
  ]);
  const validPlantTypeIds = new Set(plantTypes.map((p) => p.id));
  const validStaffIds = new Set(staffList.map((s) => s.id));
  const invalid = items.find((i) => !validPlantTypeIds.has(i.plantTypeId) || !validStaffIds.has(i.assignedStaffId));
  if (invalid) {
    return NextResponse.json({ message: "Có dòng chọn mã cây hoặc NV cấy mô không hợp lệ" }, { status: 400 });
  }

  const proposal = await prisma.motherForecastEditProposal.create({
    data: {
      warehouseId, taskMonth, reason, requestedById: session.user.id,
      items: { create: items.map((i) => ({ plantTypeId: i.plantTypeId, assignedStaffId: i.assignedStaffId, quantity1: i.quantity1, quantity2: i.quantity2, quantity3: i.quantity3 })) },
    },
    select: proposalSelect,
  });

  // targetRole (createAlert) chưa hỗ trợ ADMIN_KY_THUAT — gửi riêng userId cho từng Admin kỹ thuật/Admin
  // cấp cao đang active, khác cách rooting-forecast-edit-proposals dùng targetRole ADMIN/SUPER_ADMIN.
  const reviewers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN_KY_THUAT", "SUPER_ADMIN"] }, isActive: true },
    select: { id: true },
  });
  for (const r of reviewers) {
    await createAlert({
      type: "MOTHER_FORECAST_EDIT_PROPOSAL",
      title: "Đề xuất chỉnh sửa: Dự kiến đáp ứng mẫu mẹ",
      message: `${session.user.name} vừa gửi đề xuất chỉnh sửa cho ${proposal.warehouse.name} — cần duyệt.`,
      userId: r.id,
      relatedId: proposal.id,
      relatedType: "MotherForecastEditProposal",
    });
  }

  return NextResponse.json(proposal, { status: 201 });
}
