import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z
  .object({
    name: z.string().min(2).optional(),
    isActive: z.boolean().optional(),
    allowsReturn: z.boolean().optional(),
    returnWindowDays: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => !d.allowsReturn || d.returnWindowDays === undefined || (d.returnWindowDays !== null && d.returnWindowDays > 0), {
    message: "Cần nhập số ngày được phép trả hàng (lớn hơn 0)",
    path: ["returnWindowDays"],
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền sửa nhà cung cấp" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = { ...parsed.data };
  if (data.allowsReturn === false) data.returnWindowDays = null;

  const item = await prisma.supplier.update({ where: { id }, data });
  return NextResponse.json(item);
}
