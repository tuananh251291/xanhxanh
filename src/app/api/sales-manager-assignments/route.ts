import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const upsertSchema = z.object({
  salesUserId: z.string().min(1, "Chọn nhân viên bán hàng"),
  managerId: z.string().min(1, "Chọn nhân viên quản lý"),
  marketId: z.string().min(1, "Chọn thị trường"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới xem được phân công quản lý" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const marketId = searchParams.get("marketId") || undefined;
  const assignments = await prisma.salesManagerAssignment.findMany({
    where: marketId ? { marketId } : {},
    select: {
      id: true,
      marketId: true,
      salesUser: { select: { id: true, code: true, name: true } },
      manager: { select: { id: true, code: true, name: true } },
    },
    orderBy: { salesUser: { name: "asc" } },
  });
  return NextResponse.json(assignments);
}

// Upsert theo (salesUserId, marketId) — Admin chọn NV quản lý mới cho 1 dòng thì ghi đè luôn thay vì
// phải xoá dòng cũ trước, đúng ngữ nghĩa "mỗi (NV bán hàng, thị trường) có đúng 1 NV quản lý".
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được gán quản lý" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { salesUserId, managerId, marketId } = parsed.data;

  if (salesUserId === managerId) {
    return NextResponse.json({ message: "Nhân viên bán hàng và Nhân viên quản lý không được trùng nhau" }, { status: 400 });
  }
  const [salesUser, manager, market] = await Promise.all([
    prisma.user.findUnique({ where: { id: salesUserId } }),
    prisma.user.findUnique({ where: { id: managerId } }),
    prisma.market.findUnique({ where: { id: marketId } }),
  ]);
  if (!salesUser) return NextResponse.json({ message: "Nhân viên bán hàng không tồn tại" }, { status: 400 });
  if (!manager) return NextResponse.json({ message: "Nhân viên quản lý không tồn tại" }, { status: 400 });
  if (!market) return NextResponse.json({ message: "Thị trường không tồn tại" }, { status: 400 });
  // Cả 2 vế đều phải là NV bán hàng (SALE) — quản lý ở đây là 1 NV bán hàng kiêm quản lý, không phải
  // vai trò khác trong hệ thống (chặn ở server phòng client gửi thẳng lên, bỏ qua dropdown đã lọc sẵn).
  if (salesUser.role !== "SALE") return NextResponse.json({ message: "Chỉ được gán cho nhân viên bán hàng" }, { status: 400 });
  if (manager.role !== "SALE") return NextResponse.json({ message: "Nhân viên quản lý phải là nhân viên bán hàng" }, { status: 400 });

  const assignment = await prisma.salesManagerAssignment.upsert({
    where: { salesUserId_marketId: { salesUserId, marketId } },
    update: { managerId },
    create: { salesUserId, managerId, marketId },
    select: {
      id: true,
      marketId: true,
      salesUser: { select: { id: true, code: true, name: true } },
      manager: { select: { id: true, code: true, name: true } },
    },
  });
  return NextResponse.json(assignment, { status: 201 });
}
