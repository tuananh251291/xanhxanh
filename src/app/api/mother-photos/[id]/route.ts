import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { deleteMotherPhoto } from "@/lib/mother-photo-storage";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const photo = await prisma.motherPhoto.findUnique({ where: { id }, select: { id: true, takenById: true, imageUrl: true } });
  if (!photo) return NextResponse.json({ ok: true });

  const role = session?.user?.role;
  const isOwner = session?.user?.id === photo.takenById;
  if (!isOwner && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền xoá ảnh này" }, { status: 403 });
  }

  await prisma.motherPhoto.delete({ where: { id } });
  await deleteMotherPhoto(photo.imageUrl).catch(() => null);
  return NextResponse.json({ ok: true });
}
