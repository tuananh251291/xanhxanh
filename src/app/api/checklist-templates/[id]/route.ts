import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const template = await prisma.checklistTemplate.update({ where: { id }, data: parsed.data });
  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const usageCount = await prisma.checklistItem.count({ where: { templateId: id } });
  if (usageCount > 0) {
    // Đã có lịch sử đầu việc gắn với template này — ẩn thay vì xóa để không mất dữ liệu báo cáo cũ.
    await prisma.checklistTemplate.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ deactivated: true });
  }
  await prisma.checklistTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
