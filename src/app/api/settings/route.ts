import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configs = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json(configs);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json() as { key: string; value: string }[];
  if (!Array.isArray(body)) return NextResponse.json({ message: "Cần mảng [{key, value}]" }, { status: 400 });
  const updated = await Promise.all(
    body.map(({ key, value }) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );
  return NextResponse.json(updated);
}
