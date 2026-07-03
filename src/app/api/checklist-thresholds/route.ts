import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const ROLES = [
  "SUPER_ADMIN", "ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI",
] as const;

const updateSchema = z.array(z.object({
  role: z.enum(ROLES),
  minPercent: z.number().int().min(0).max(100),
}));

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thresholds = await prisma.checklistThreshold.findMany();
  return NextResponse.json(thresholds);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const updated = await Promise.all(
    parsed.data.map(({ role, minPercent }) =>
      prisma.checklistThreshold.upsert({
        where: { role },
        update: { minPercent },
        create: { role, minPercent },
      })
    )
  );
  return NextResponse.json(updated);
}
