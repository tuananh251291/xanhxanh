import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { normalizeCustomerName, normalizeWebsite, getCustomerManager } from "@/lib/customer";

const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên khách hàng - công ty"),
  website: z.string().trim().min(1, "Nhập website"),
});

// Kiểm tra trùng khách — báo trùng nếu khớp Tên công ty HOẶC Website (không phân biệt hoa/thường, bỏ
// khoảng trắng thừa). Nếu có nhiều khách khớp (hiếm), ưu tiên khách khớp CẢ 2 trường trước.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const nameNormalized = normalizeCustomerName(parsed.data.name);
  const websiteNormalized = normalizeWebsite(parsed.data.website);

  const matches = await prisma.customer.findMany({
    where: { OR: [{ nameNormalized }, { websiteNormalized }] },
    select: {
      id: true, name: true, website: true, marketId: true,
      market: { select: { code: true, name: true } },
      status: true, assignedToId: true,
      assignedTo: { select: { id: true, code: true, name: true } },
      nameNormalized: true, websiteNormalized: true,
    },
  });
  if (matches.length === 0) return NextResponse.json({ match: null });

  const bestMatch =
    matches.find((m) => m.nameNormalized === nameNormalized && m.websiteNormalized === websiteNormalized) ??
    matches[0];

  const manager = await getCustomerManager(bestMatch.assignedToId, bestMatch.marketId);

  return NextResponse.json({
    match: {
      id: bestMatch.id,
      name: bestMatch.name,
      website: bestMatch.website,
      market: bestMatch.market,
      status: bestMatch.status,
      assignedTo: bestMatch.assignedTo,
      manager,
    },
  });
}
