import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const patchSchema = z.union([
  z.object({ status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED", "ENDED"]) }),
  z.object({ assignedToId: z.string().min(1) }),
  z.object({ confirmHandover: z.literal(true) }),
  z.object({ confirmMotherReceived: z.literal(true) }),
]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id },
    include: {
      plantType: true,
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      items: {
        include: {
          shelf: { include: { warehouse: true } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
        },
      },
      dailyRecords: {
        include: {
          staff: { select: { name: true } },
          items: { include: { lot: { select: { code: true, stage: true, quantity: true } } } },
        },
        orderBy: { recordDate: "desc" },
      },
      lots: { where: { status: "ACTIVE" }, include: { shelf: true } },
      mediumOrder: { select: { id: true, code: true, confirmedAt: true } },
    },
  });
  if (!instruction) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(instruction);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id } = await params;
  const role = session?.user?.role;

  if ("confirmMotherReceived" in parsed.data) {
    const instruction = await prisma.plantingInstruction.findUnique({ where: { id } });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (instruction.assignedToId !== session?.user?.id) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const updated = await prisma.plantingInstruction.update({
      where: { id },
      data: { motherReceivedAt: instruction.motherReceivedAt ?? new Date() },
    });
    return NextResponse.json(updated);
  }

  // Kho mô bấm "Bàn giao" khi NV cấy mô đã có sẵn (kệ "đã chia" tự động điền mặc định lúc tạo chỉ
  // định) — chỉ xác nhận thời điểm bàn giao thật, không cần chọn lại NV.
  if ("confirmHandover" in parsed.data) {
    if (!(isAdminRole(role) || role === "KHO_MO")) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const instruction = await prisma.plantingInstruction.findUnique({ where: { id } });
    if (!instruction) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
    if (!instruction.assignedToId) {
      return NextResponse.json({ message: "Chỉ định chưa có nhân viên cấy mô để bàn giao" }, { status: 400 });
    }
    const updated = await prisma.plantingInstruction.update({
      where: { id },
      data: { handedOverAt: instruction.handedOverAt ?? new Date() },
      include: { assignedTo: { select: { name: true } } },
    });
    return NextResponse.json(updated);
  }

  const isAssignAction = "assignedToId" in parsed.data;
  const allowed = isAssignAction
    ? isAdminRole(role) || role === "KHO_MO"
    : isAdminRole(role) || role === "KY_THUAT";
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  // NV cấy mô chỉ nhận chỉ định mới sau khi chỉ định hiện tại đã "Kết thúc".
  if ("assignedToId" in parsed.data) {
    const stillActive = await prisma.plantingInstruction.findFirst({
      where: { assignedToId: parsed.data.assignedToId, status: "ACTIVE" },
      select: { code: true },
    });
    if (stillActive) {
      return NextResponse.json(
        { message: `Nhân viên cấy mô này còn chỉ định ${stillActive.code} chưa kết thúc, không thể nhận chỉ định mới` },
        { status: 400 }
      );
    }
  }

  // Kho mô chọn NV cấy mô (kệ "chung") = hành động bàn giao luôn, đánh dấu cả 2 mốc cùng lúc.
  const updated = await prisma.plantingInstruction.update({
    where: { id },
    data: isAssignAction ? { ...parsed.data, handedOverAt: new Date() } : parsed.data,
    include: { assignedTo: { select: { name: true } } },
  });
  return NextResponse.json(updated);
}
