import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { isSocialMediaWebsite, normalizeCustomerName, normalizeWebsite } from "@/lib/customer";
import { generateCustomerCode } from "@/lib/codes";

const createSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên khách hàng - công ty"),
  website: z.string().trim().min(1, "Nhập website"),
  marketId: z.string().min(1, "Chọn thị trường"),
  email: z.string().trim().email("Email không hợp lệ"),
  phone: z.string().trim().min(1, "Nhập số điện thoại"),
  status: z.enum(["CHUA_PHAN_CONG", "DA_PHAN_CONG", "MAC_DINH"]),
  customerGroup: z.enum(["KHACH_SI_NHO", "KHACH_CONG_TY", "KHACH_CONG_TY_LON"]).optional().nullable(),
  firstContactAt: z.string().min(1, "Chọn ngày đầu tiếp cận"),
  lastOrderAt: z.string().optional().nullable(),
  lastOrderCode: z.string().trim().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

const CUSTOMER_LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  website: true,
  marketId: true,
  market: { select: { id: true, code: true, name: true } },
  email: true,
  phone: true,
  status: true,
  customerGroup: true,
  firstContactAt: true,
  lastOrderAt: true,
  lastOrderCode: true,
  assignedToId: true,
  assignedTo: { select: { id: true, code: true, name: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới xem được danh sách khách hàng" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const marketId = searchParams.get("marketId") || undefined;
  const status = searchParams.get("status") || undefined;
  const customerGroup = searchParams.get("customerGroup") || undefined;
  const q = searchParams.get("q")?.trim();

  const customers = await prisma.customer.findMany({
    where: {
      ...(marketId ? { marketId } : {}),
      ...(status ? { status: status as "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH" } : {}),
      ...(customerGroup ? { customerGroup: customerGroup as "KHACH_SI_NHO" | "KHACH_CONG_TY" | "KHACH_CONG_TY_LON" } : {}),
      ...(q ? { nameNormalized: { contains: normalizeCustomerName(q) } } : {}),
    },
    select: CUSTOMER_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });

  // Suy "Nhân viên quản lý" hàng loạt thay vì N+1 — batch load toàn bộ SalesManagerAssignment liên quan
  // rồi map theo (assignedToId, marketId), xem getCustomerManager (src/lib/customer-manager.ts) cho logic 1-dòng.
  const pairs = Array.from(
    new Set(customers.filter((c) => c.assignedToId).map((c) => `${c.assignedToId}:${c.marketId}`))
  );
  const assignments = pairs.length
    ? await prisma.salesManagerAssignment.findMany({
        where: { OR: pairs.map((p) => { const [salesUserId, marketId] = p.split(":"); return { salesUserId, marketId }; }) },
        select: { salesUserId: true, marketId: true, manager: { select: { id: true, code: true, name: true } } },
      })
    : [];
  const managerByPair = new Map(assignments.map((a) => [`${a.salesUserId}:${a.marketId}`, a.manager]));

  const result = customers.map((c) => ({
    ...c,
    manager: c.assignedToId ? managerByPair.get(`${c.assignedToId}:${c.marketId}`) ?? null : null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được tạo khách hàng" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  const market = await prisma.market.findUnique({ where: { id: data.marketId } });
  if (!market) return NextResponse.json({ message: "Thị trường không tồn tại" }, { status: 400 });

  if ((data.status === "DA_PHAN_CONG" || data.status === "MAC_DINH") && !data.assignedToId) {
    return NextResponse.json({ message: "Trạng thái này cần chọn Nhân viên phụ trách" }, { status: 400 });
  }
  if (data.assignedToId) {
    const staff = await prisma.user.findUnique({ where: { id: data.assignedToId } });
    if (!staff) return NextResponse.json({ message: "Nhân viên phụ trách không tồn tại" }, { status: 400 });
  }

  const nameNormalized = normalizeCustomerName(data.name);
  const websiteNormalized = normalizeWebsite(data.website);
  // Link mạng xã hội (facebook.com, instagram.com...) không phải website riêng — không dùng để đối
  // chiếu trùng khách (vẫn lưu link gốc bình thường).
  const websiteForMatch = !isSocialMediaWebsite(websiteNormalized) ? websiteNormalized : "";
  const duplicate = await prisma.customer.findFirst({
    where: { OR: [{ nameNormalized }, ...(websiteForMatch ? [{ websiteNormalized: websiteForMatch }] : [])] },
  });
  if (duplicate) {
    return NextResponse.json({ message: "Đã có khách hàng trùng Tên công ty hoặc Website trong hệ thống" }, { status: 409 });
  }

  const customer = await prisma.$transaction(async (tx) => {
    const code = await generateCustomerCode(tx);
    return tx.customer.create({
      data: {
        code,
        name: data.name,
        nameNormalized,
        website: data.website,
        websiteNormalized,
        marketId: data.marketId,
        email: data.email,
        phone: data.phone,
        status: data.status,
        customerGroup: data.customerGroup || null,
        firstContactAt: new Date(data.firstContactAt),
        lastOrderAt: data.lastOrderAt ? new Date(data.lastOrderAt) : null,
        lastOrderCode: data.lastOrderCode || null,
        assignedToId: data.status === "CHUA_PHAN_CONG" ? null : data.assignedToId,
      },
    });
  });
  return NextResponse.json(customer, { status: 201 });
}
