import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const ROLES = ["SUPER_ADMIN", "ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI"] as const;

const patchSchema = z.object({
  changes: z.array(z.object({
    role: z.enum(ROLES),
    href: z.string(),
    enabled: z.boolean(),
  })),
});

export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const permissions = await prisma.rolePermission.findMany();
  return NextResponse.json(permissions);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const changes = parsed.data.changes.filter((c) => !isAdminRole(c.role));

  await prisma.$transaction(
    changes.map((c) =>
      prisma.rolePermission.upsert({
        where: { role_href: { role: c.role, href: c.href } },
        update: { enabled: c.enabled },
        create: { role: c.role, href: c.href, enabled: c.enabled },
      })
    )
  );

  return NextResponse.json({ success: true });
}
