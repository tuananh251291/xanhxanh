import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek } from "date-fns";
import { z } from "zod";

// Xác nhận ngày bắt đầu cho 1 kì cấy R&D đã được TỰ TẠO SẴN ở trạng thái DRAFT (đầu vào = mẫu mẹ trả ra
// kì trước, xem createNextRndRound trong src/lib/rnd-instruction-chain.ts) — Admin kỹ thuật chỉ cần chọn
// ngày, không cần nhập lại số lượng/mã cây/môi trường (đã kế thừa từ kì trước). Cùng cách gộp "bàn giao +
// nhận mẫu mẹ" thành 1 hành động như lúc tạo chỉ định lần đầu (xem POST /api/rnd-production/instructions).
const confirmSchema = z.object({ startDate: z.string().min(1, "Cần chọn ngày bắt đầu") });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const instruction = await prisma.plantingInstruction.findUnique({ where: { id } });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  if (instruction.createdById !== session.user.id) {
    return NextResponse.json({ message: "Không phải chỉ định của bạn" }, { status: 403 });
  }
  if (instruction.status !== "DRAFT") {
    return NextResponse.json({ message: "Chỉ định này đã được xác nhận trước đó" }, { status: 400 });
  }

  const startDate = new Date(parsed.data.startDate);
  if (Number.isNaN(startDate.getTime())) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });
  const weekStart = toStoredWeekStart(startOfWeek(startDate, { weekStartsOn: 1 }));

  const now = new Date();
  const updated = await prisma.plantingInstruction.update({
    where: { id },
    data: {
      status: "ACTIVE",
      weekStart,
      handedOverAt: now,
      handedOverById: session.user.id,
      motherReceivedAt: now,
    },
  });

  return NextResponse.json(updated);
}
