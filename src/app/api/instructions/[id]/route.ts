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
    // NV cấy mô chỉ được thực hiện 1 chỉ định tại 1 thời điểm — KHO_MO có thể bàn giao trước chỉ định
    // mới bất cứ lúc nào, nhưng NV cấy mô chỉ được XÁC NHẬN (bắt đầu) sau khi chỉ định đang thực hiện
    // hiện tại (đã xác nhận nhận mẫu mẹ nhưng chưa kết thúc) thực sự kết thúc.
    if (!instruction.motherReceivedAt) {
      const stillActive = await prisma.plantingInstruction.findFirst({
        where: {
          assignedToId: instruction.assignedToId,
          motherReceivedAt: { not: null },
          status: { in: ["ACTIVE", "DRAFT"] },
          id: { not: id },
        },
        select: { code: true },
      });
      if (stillActive) {
        return NextResponse.json(
          { message: `Bạn còn chỉ định ${stillActive.code} đang thực hiện chưa kết thúc — chỉ có thể xác nhận chỉ định mới sau khi chỉ định đó kết thúc` },
          { status: 400 }
        );
      }
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
    // Kho mô được bàn giao trước chỉ định mới ngay cả khi NV cấy mô đang thực hiện chỉ định khác — luật
    // "1 chỉ định tại 1 thời điểm" chỉ chặn ở bước NV cấy mô XÁC NHẬN (xem confirmMotherReceived).
    const updated = await prisma.plantingInstruction.update({
      where: { id },
      data: {
        handedOverAt: instruction.handedOverAt ?? new Date(),
        handedOverById: instruction.handedOverById ?? session!.user!.id,
        // Bàn giao thật sự nghĩa là chỉ định đã bắt đầu chạy — kích hoạt luôn nếu còn ở DRAFT, tránh kẹt
        // ở DRAFT vĩnh viễn (khiến nút xác nhận nhận mẫu mẹ và luật "1 NV/1 chỉ định ACTIVE" bị sai lệch).
        status: instruction.status === "DRAFT" ? "ACTIVE" : instruction.status,
      },
      include: { assignedTo: { select: { name: true } } },
    });
    return NextResponse.json(updated);
  }

  const isAssignAction = "assignedToId" in parsed.data;
  const allowed = isAssignAction
    ? isAdminRole(role) || role === "KHO_MO"
    : isAdminRole(role) || role === "KY_THUAT";
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  // Kho mô được gán/bàn giao trước chỉ định mới (kệ "chung") ngay cả khi NV cấy mô đang thực hiện chỉ
  // định khác — luật "1 chỉ định tại 1 thời điểm" chỉ chặn ở bước NV cấy mô XÁC NHẬN (confirmMotherReceived).
  // Kho mô chọn NV cấy mô (kệ "chung") = hành động bàn giao luôn, đánh dấu cả 2 mốc cùng lúc.
  const updated = await prisma.plantingInstruction.update({
    where: { id },
    data: isAssignAction ? { ...parsed.data, handedOverAt: new Date(), handedOverById: session!.user!.id } : parsed.data,
    include: { assignedTo: { select: { name: true } } },
  });
  return NextResponse.json(updated);
}
