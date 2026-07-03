import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const ROLES = ["ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI"] as const;

const patchSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("APPROVED"), role: z.enum(ROLES) }),
  z.object({ status: z.literal("REJECTED") }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  // Chỉ Admin cao nhất (SUPER_ADMIN) được duyệt/từ chối tài khoản mới — Admin thường không có quyền này.
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền duyệt tài khoản" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, code: true, name: true, email: true, role: true, status: true },
  });

  return NextResponse.json(user);
}
