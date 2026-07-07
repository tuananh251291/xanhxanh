import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";
import type { RoomType } from "@prisma/client";

const ROOM_TYPES = ["PHONG_MAU_ME", "PHONG_RA_RE", "PHONG_TOI", "PHONG_NHIEM", "PHONG_KHA_DUNG", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG"] as const;

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(ROOM_TYPES),
  warehouseId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const warehouseId = searchParams.get("warehouseId");

  const rooms = await prisma.room.findMany({
    where: {
      isActive: true,
      ...(type ? { type: type as RoomType } : {}),
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
      shelves: { where: { isActive: true } },
    },
    orderBy: [{ warehouse: { name: "asc" } }, { type: "asc" }],
  });
  return NextResponse.json(rooms);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existing = await prisma.room.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return NextResponse.json({ message: "Mã phòng đã tồn tại" }, { status: 409 });
  }

  const room = await prisma.room.create({ data: parsed.data });
  return NextResponse.json(room, { status: 201 });
}
