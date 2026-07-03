import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const actionSchema = z.object({ action: z.enum(["confirm", "reject"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const handover = await prisma.mediumHandover.findUnique({ where: { id } });
  if (!handover) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (handover.status !== "PENDING") return NextResponse.json({ message: "Phiếu đã xử lý" }, { status: 400 });
  if (handover.toUserId !== session.user.id) {
    return NextResponse.json({ message: "Chỉ NV cấy được chỉ định nhận mới xác nhận được phiếu này" }, { status: 403 });
  }

  const updated = await prisma.mediumHandover.update({
    where: { id },
    data:
      parsed.data.action === "confirm"
        ? { status: "CONFIRMED", confirmedAt: new Date() }
        : { status: "REJECTED" },
  });

  return NextResponse.json(updated);
}
