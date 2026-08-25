import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { isSocialMediaWebsite, normalizeCustomerName, normalizeWebsite, validateWebsite } from "@/lib/customer";
import { getCustomerManager } from "@/lib/customer-manager";

// Website/SĐT/Email đều KHÔNG bắt buộc riêng lẻ — nhưng phải có ÍT NHẤT 1 trong 3 (cùng ràng buộc ở
// POST /api/customer-check/create) để còn cơ sở đối chiếu trùng khách ngoài Tên công ty.
const schema = z
  .object({
    name: z.string().trim().min(1, "Nhập tên khách hàng - công ty"),
    website: z.string().trim().optional().default("").superRefine((v, ctx) => {
      if (!v) return;
      const error = validateWebsite(v);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
    phone: z.string().trim().optional().default(""),
    email: z.string().trim().optional().default("").superRefine((v, ctx) => {
      if (!v) return;
      if (!z.string().email().safeParse(v).success) ctx.addIssue({ code: "custom", message: "Email không hợp lệ" });
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.website && !data.phone && !data.email) {
      ctx.addIssue({ code: "custom", message: "Cần nhập ít nhất Website, Số điện thoại hoặc Email", path: ["website"] });
    }
  });

// Kiểm tra trùng khách — báo trùng nếu khớp Tên công ty HOẶC Website HOẶC Số điện thoại HOẶC Email
// (không phân biệt hoa/thường, bỏ khoảng trắng thừa) — chỉ so khớp theo các trường NV thực sự nhập, để
// trống trường nào thì bỏ qua trường đó (tránh 2 khách cùng để trống Website/SĐT/Email bị coi là trùng
// nhau). Nếu có nhiều khách khớp (hiếm), ưu tiên khách khớp NHIỀU trường nhất trước.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ NV bán hàng mới dùng được tính năng này" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const nameNormalized = normalizeCustomerName(parsed.data.name);
  const websiteRaw = parsed.data.website ? normalizeWebsite(parsed.data.website) : "";
  // Link mạng xã hội (facebook.com, instagram.com...) không phải website riêng của 1 công ty — rất nhiều
  // khách khác nhau cùng dùng chung domain này, so trùng theo đó sẽ báo trùng sai. Vẫn lưu/hiển thị link
  // gốc bình thường, chỉ KHÔNG dùng để đối chiếu trùng khách.
  const websiteNormalized = websiteRaw && !isSocialMediaWebsite(websiteRaw) ? websiteRaw : "";
  const phone = parsed.data.phone;
  const email = parsed.data.email.toLowerCase();

  const matches = await prisma.customer.findMany({
    where: {
      OR: [
        { nameNormalized },
        ...(websiteNormalized ? [{ websiteNormalized }] : []),
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      id: true, name: true, website: true, phone: true, email: true, marketId: true,
      market: { select: { code: true, name: true } },
      status: true, assignedToId: true,
      assignedTo: { select: { id: true, code: true, name: true } },
      nameNormalized: true, websiteNormalized: true,
    },
  });
  if (matches.length === 0) return NextResponse.json({ match: null });

  const scoreOf = (m: (typeof matches)[number]) =>
    (m.nameNormalized === nameNormalized ? 1 : 0) +
    (websiteNormalized && m.websiteNormalized === websiteNormalized ? 1 : 0) +
    (phone && m.phone === phone ? 1 : 0) +
    (email && m.email?.toLowerCase() === email ? 1 : 0);

  const bestMatch = matches.reduce((best, m) => (scoreOf(m) > scoreOf(best) ? m : best), matches[0]);

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
