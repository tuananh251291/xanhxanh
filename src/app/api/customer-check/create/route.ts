import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { isSocialMediaWebsite, normalizeCustomerName, normalizeWebsite, validateWebsite } from "@/lib/customer";
import { generateCustomerCode } from "@/lib/codes";

// Website/SĐT/Email đều KHÔNG bắt buộc riêng lẻ — nhưng phải có ÍT NHẤT 1 trong 3 (cùng ràng buộc ở
// POST /api/customer-check).
const schema = z
  .object({
    name: z.string().trim().min(1, "Nhập tên khách hàng - công ty"),
    website: z.string().trim().optional().default("").superRefine((v, ctx) => {
      if (!v) return;
      const error = validateWebsite(v);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
    marketId: z.string().min(1, "Chọn thị trường"),
    email: z.string().trim().optional().default("").superRefine((v, ctx) => {
      if (!v) return;
      if (!z.string().email().safeParse(v).success) ctx.addIssue({ code: "custom", message: "Email không hợp lệ" });
    }),
    phone: z.string().trim().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.website && !data.phone && !data.email) {
      ctx.addIssue({ code: "custom", message: "Cần nhập ít nhất Website, Số điện thoại hoặc Email", path: ["website"] });
    }
  });

// NV bán hàng tạo mới 1 khách hàng chưa từng có trong hệ thống + tự đăng ký phụ trách luôn — server tự
// gán NV phụ trách = NV đang đăng nhập, Trạng thái = Đã phân công, Ngày đầu tiếp cận = hôm nay.
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
  const data = parsed.data;

  const market = await prisma.market.findUnique({ where: { id: data.marketId } });
  if (!market) return NextResponse.json({ message: "Thị trường không tồn tại" }, { status: 400 });

  const nameNormalized = normalizeCustomerName(data.name);
  const websiteNormalized = data.website ? normalizeWebsite(data.website) : "";
  // Link mạng xã hội (facebook.com, instagram.com...) không phải website riêng — nhiều khách khác nhau
  // cùng dùng chung domain này, không dùng để đối chiếu trùng khách (vẫn lưu link gốc bình thường).
  const websiteForMatch = websiteNormalized && !isSocialMediaWebsite(websiteNormalized) ? websiteNormalized : "";
  const email = data.email.toLowerCase();
  // Race condition: 2 NV cùng bấm "Tiếp tục" cho cùng 1 khách gần như đồng thời — chặn lại ở đây thay
  // vì chỉ dựa vào bước "Kiểm tra" trước đó (đã có thể lỗi thời tại thời điểm submit). Chỉ so khớp theo
  // các trường THỰC SỰ có giá trị — bỏ trống Website/SĐT/Email không được coi là trùng với khách khác
  // cũng bỏ trống trường đó.
  const duplicate = await prisma.customer.findFirst({
    where: {
      OR: [
        { nameNormalized },
        ...(websiteForMatch ? [{ websiteNormalized: websiteForMatch }] : []),
        ...(data.phone ? [{ phone: data.phone }] : []),
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
  });
  if (duplicate) {
    return NextResponse.json({ message: "Khách này vừa được tạo/đăng ký bởi người khác, vui lòng kiểm tra lại" }, { status: 409 });
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
        email: email || null,
        phone: data.phone || null,
        status: "DA_PHAN_CONG",
        firstContactAt: new Date(),
        assignedToId: session.user.id,
      },
    });
  });
  return NextResponse.json(customer, { status: 201 });
}
