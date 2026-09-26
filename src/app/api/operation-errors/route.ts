import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateOperationErrorTicketCode } from "@/lib/codes";
import { computeOperationErrorReport } from "@/lib/operation-error-report";

// Báo cáo "Đơn vận hành lỗi" — Đối tác vận hành CHỈ XEM đúng kho mình phụ trách (workplaceWarehouseId,
// KHÔNG tạo được — canEdit=false); NV bán hàng "Quản lý bán lẻ" xem + tạo đúng (các) kho được gán qua
// RetailWarehouseAccess; Admin xem/tạo tất cả — cùng quy ước phân quyền với /api/reject-classifications.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const requestedWarehouseId = searchParams.get("warehouseId") || undefined;

  let warehouseIds: string[] | null = null;
  let canEdit = false;
  if (role === "DOI_TAC_VAN_HANH") {
    if (!session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Bạn chưa được gán Kho thị trường phụ trách" }, { status: 403 });
    }
    warehouseIds = [session.user.workplaceWarehouseId];
  } else if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findMany({ where: { userId: session.user.id }, select: { warehouseId: true } });
    if (access.length === 0) return NextResponse.json({ message: "Bạn chưa được gán Kho thị trường nào" }, { status: 403 });
    const allowed = access.map((a) => a.warehouseId);
    warehouseIds = requestedWarehouseId ? allowed.filter((wid) => wid === requestedWarehouseId) : allowed;
    canEdit = true;
  } else if (isAdminRole(role)) {
    warehouseIds = requestedWarehouseId ? [requestedWarehouseId] : null;
    canEdit = true;
  } else {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const result = await computeOperationErrorReport(monthParam, warehouseIds);
  return NextResponse.json({ ...result, canEdit });
}

const createSchema = z.object({
  warehouseId: z.string().min(1),
  occurredAt: z.string().min(1),
  description: z.string().min(1),
  costAmount: z.number().int().min(0),
  xanhxanhCost: z.number().int().min(0),
});

// Tạo 1 đơn vận hành lỗi — chỉ NV bán hàng "Quản lý bán lẻ" (đúng kho được gán) hoặc Admin. Đối tác vận
// hành không gọi được endpoint này (canEdit luôn false ở GET phía trên, form phía client cũng ẩn hẳn).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "SALE" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { warehouseId, occurredAt, description, costAmount, xanhxanhCost } = parsed.data;

  if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findFirst({ where: { userId: session.user.id, warehouseId } });
    if (!access) return NextResponse.json({ message: "Bạn không được gán Kho thị trường này" }, { status: 403 });
  }

  const occurredDate = new Date(occurredAt);
  if (Number.isNaN(occurredDate.getTime())) return NextResponse.json({ message: "Ngày xảy ra không hợp lệ" }, { status: 400 });
  if (xanhxanhCost > costAmount) {
    return NextResponse.json({ message: "Xanh Xanh chịu chi phí không được vượt quá Chi phí phát sinh" }, { status: 400 });
  }

  const code = await generateOperationErrorTicketCode();
  const ticket = await prisma.operationErrorTicket.create({
    data: {
      code,
      warehouseId,
      occurredAt: occurredDate,
      description,
      costAmount,
      xanhxanhCost,
      partnerCost: costAmount - xanhxanhCost,
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ success: true, id: ticket.id, code: ticket.code });
}
