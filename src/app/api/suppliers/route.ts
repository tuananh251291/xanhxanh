import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateSupplierCode } from "@/lib/codes";
import { z } from "zod";

const schema = z
  .object({
    name: z.string().min(2),
    allowsReturn: z.boolean(),
    returnWindowDays: z.number().int().positive().nullable(),
  })
  .refine((d) => !d.allowsReturn || (d.returnWindowDays !== null && d.returnWindowDays > 0), {
    message: "Cần nhập số ngày được phép trả hàng (lớn hơn 0)",
    path: ["returnWindowDays"],
  });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  return NextResponse.json(items);
}

// Mã/tên nhà cung cấp chỉ do Admin cấp cao (SUPER_ADMIN) tạo.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền tạo nhà cung cấp" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { name, allowsReturn, returnWindowDays } = parsed.data;
  const code = await generateSupplierCode();
  const item = await prisma.supplier.create({
    data: { code, name, allowsReturn, returnWindowDays: allowsReturn ? returnWindowDays : null },
  });
  return NextResponse.json(item, { status: 201 });
}
