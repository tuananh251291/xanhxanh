import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { isSocialMediaWebsite, normalizeCustomerName, normalizeWebsite } from "@/lib/customer";

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  website: z.string().trim().min(1).optional(),
  marketId: z.string().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).optional(),
  status: z.enum(["CHUA_PHAN_CONG", "DA_PHAN_CONG", "MAC_DINH"]).optional(),
  customerGroup: z.enum(["KHACH_SI_NHO", "KHACH_CONG_TY", "KHACH_CONG_TY_LON"]).optional().nullable(),
  firstContactAt: z.string().min(1).optional(),
  lastOrderAt: z.string().optional().nullable(),
  lastOrderCode: z.string().trim().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được sửa khách hàng" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy khách hàng" }, { status: 404 });

  if (data.marketId) {
    const market = await prisma.market.findUnique({ where: { id: data.marketId } });
    if (!market) return NextResponse.json({ message: "Thị trường không tồn tại" }, { status: 400 });
  }

  const nextStatus = data.status ?? existing.status;
  let nextAssignedToId = data.assignedToId !== undefined ? data.assignedToId : existing.assignedToId;
  if (nextStatus === "CHUA_PHAN_CONG") {
    nextAssignedToId = null;
  } else if ((nextStatus === "DA_PHAN_CONG" || nextStatus === "MAC_DINH") && !nextAssignedToId) {
    return NextResponse.json({ message: "Trạng thái này cần chọn Nhân viên phụ trách" }, { status: 400 });
  }
  if (nextAssignedToId) {
    const staff = await prisma.user.findUnique({ where: { id: nextAssignedToId } });
    if (!staff) return NextResponse.json({ message: "Nhân viên phụ trách không tồn tại" }, { status: 400 });
  }

  const nameNormalized = data.name ? normalizeCustomerName(data.name) : undefined;
  const websiteNormalized = data.website ? normalizeWebsite(data.website) : undefined;
  // Link mạng xã hội (facebook.com, instagram.com...) không phải website riêng — không dùng để đối
  // chiếu trùng khách (vẫn lưu link gốc bình thường).
  const websiteForMatch = websiteNormalized && !isSocialMediaWebsite(websiteNormalized) ? websiteNormalized : undefined;
  if (nameNormalized || websiteForMatch) {
    const duplicate = await prisma.customer.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(nameNormalized ? [{ nameNormalized }] : []),
          ...(websiteForMatch ? [{ websiteNormalized: websiteForMatch }] : []),
        ],
      },
    });
    if (duplicate) {
      return NextResponse.json({ message: "Đã có khách hàng khác trùng Tên công ty hoặc Website" }, { status: 409 });
    }
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name, nameNormalized } : {}),
      ...(data.website ? { website: data.website, websiteNormalized } : {}),
      ...(data.marketId ? { marketId: data.marketId } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.customerGroup !== undefined ? { customerGroup: data.customerGroup } : {}),
      status: nextStatus,
      assignedToId: nextAssignedToId,
      ...(data.firstContactAt ? { firstContactAt: new Date(data.firstContactAt) } : {}),
      ...(data.lastOrderAt !== undefined ? { lastOrderAt: data.lastOrderAt ? new Date(data.lastOrderAt) : null } : {}),
      ...(data.lastOrderCode !== undefined ? { lastOrderCode: data.lastOrderCode || null } : {}),
    },
  });
  return NextResponse.json(customer);
}
