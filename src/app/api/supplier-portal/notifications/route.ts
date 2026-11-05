import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Đánh dấu đã đọc mọi thông báo của tài khoản NCC. NCC không gọi được /api/alerts (proxy giới hạn trong /api/supplier-portal).
export async function PATCH() {
  const session = await auth();
  if (session?.user?.role !== "NHA_CUNG_CAP") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  await prisma.alert.updateMany({ where: { userId: session.user.id, status: "UNREAD" }, data: { status: "READ" } });
  return NextResponse.json({ success: true });
}
