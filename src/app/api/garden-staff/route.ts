import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { gardenStaffSchema } from "@/lib/garden-staff-constants";
import { z } from "zod";

const select = { id: true, name: true, phone: true, types: true, notes: true, createdAt: true } as const;

// Danh sách nhân sự (đang hoạt động) của 1 vườn — Quản lý vườn chỉ xem vườn mình quản lý, Admin xem mọi vườn.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const gardenId = new URL(req.url).searchParams.get("gardenId");
  if (!gardenId) return NextResponse.json({ message: "Thiếu vườn" }, { status: 400 });
  if (!(await canManageGarden(session.user, gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const staff = await prisma.gardenStaff.findMany({ where: { gardenId, isActive: true }, select, orderBy: { name: "asc" } });
  return NextResponse.json(staff);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = gardenStaffSchema.extend({ gardenId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { gardenId, name, phone, types, notes } = parsed.data;
  if (!(await canManageGarden(session.user, gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const staff = await prisma.gardenStaff.create({
    data: {
      gardenId, name, phone: phone || null, notes: notes || null, createdById: session.user.id,
      types: [...new Set(types)],
    },
    select,
  });
  return NextResponse.json(staff, { status: 201 });
}
