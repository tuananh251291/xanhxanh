import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { InventoryError } from "@/lib/garden-inventory";
import { cancelPackRequest, canDispatchPack } from "@/lib/garden-packing";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  // NV Điều phối huỷ phiếu — giải phóng phần chưa xuất về kho nguồn, báo QLV.
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(500).optional() }),
  // QLV giao NV đóng gói (Nhân sự vườn loại Đóng hàng) — null = bỏ giao.
  z.object({ action: z.literal("assign"), packerId: z.string().nullable() }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const request = await prisma.gardenPackRequest.findUnique({ where: { id }, select: { id: true, code: true, status: true, gardenId: true } });
  if (!request) return NextResponse.json({ message: "Không tìm thấy phiếu giao vườn" }, { status: 404 });

  try {
    if (parsed.data.action === "cancel") {
      if (!canDispatchPack(session.user.role)) return NextResponse.json({ message: "Chỉ NV Điều phối được huỷ phiếu giao vườn" }, { status: 403 });
      const released = await cancelPackRequest({ requestId: id, byId: session.user.id, reason: parsed.data.reason || null });
      return NextResponse.json({ success: true, message: `Đã huỷ phiếu ${request.code}${released > 0 ? ` — giải phóng ${released.toLocaleString("vi-VN")} cây chưa xuất` : ""}` });
    }

    if (!(await canManageGarden(session.user, request.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được giao NV đóng gói" }, { status: 403 });
    if (request.status !== "SENT") return NextResponse.json({ message: `Phiếu ${request.code} không còn chờ đóng gói` }, { status: 400 });
    const packerId = parsed.data.packerId;
    if (packerId) {
      const staff = await prisma.gardenStaff.findFirst({ where: { id: packerId, gardenId: request.gardenId, isActive: true, types: { has: "DONG_HANG" } }, select: { id: true } });
      if (!staff) return NextResponse.json({ message: "NV đóng gói phải là Nhân sự vườn đang làm việc, có loại Đóng hàng" }, { status: 400 });
    }
    await prisma.gardenPackRequest.update({ where: { id }, data: { packerId } });
    return NextResponse.json({ success: true, message: packerId ? "Đã giao NV đóng gói" : "Đã bỏ giao NV đóng gói" });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
