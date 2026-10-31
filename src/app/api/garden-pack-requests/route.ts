import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { generateGardenPackRequestCode } from "@/lib/codes";
import { canDispatchPack } from "@/lib/garden-packing";
import { GARDEN_OUTPUT_SPECS } from "@/lib/garden-receipt-constants";
import { z } from "zod";

const schema = z.object({
  orderId: z.string().min(1, "Chọn đơn hàng"),
  gardenId: z.string().min(1, "Chọn vườn sản xuất"),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(z.object({
    plantTypeId: z.string().min(1, "Chọn mã cây"),
    stageCode: z.enum(GARDEN_OUTPUT_SPECS as [string, ...string[]], { message: "Chọn size" }),
    quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
    notes: z.string().trim().max(500).optional(),
  })).min(1, "Thêm ít nhất 1 dòng cây").max(50),
});

// Nghiệp vụ 7 — NV Điều phối nhận đơn hàng Sale (đang giữ/đã xác nhận), xác nhận số lượng giao cho 1 Vườn sản xuất
// đóng gói → phiếu giao vườn (DGV-) gửi QLV vườn đó.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!canDispatchPack(session.user.role)) return NextResponse.json({ message: "Chỉ NV Điều phối được lập phiếu giao vườn" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { orderId, gardenId, notes, items } = parsed.data;

  const keys = items.map((i) => `${i.plantTypeId}|${i.stageCode}`);
  if (new Set(keys).size !== keys.length) return NextResponse.json({ message: "Mỗi mã cây + size chỉ nhập 1 dòng" }, { status: 400 });

  const [order, garden, plantTypes] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { id: true, code: true, status: true, customerCode: true } }),
    prisma.productionGarden.findUnique({ where: { id: gardenId }, select: { id: true, name: true, isActive: true, managerId: true } }),
    prisma.plantType.findMany({ where: { id: { in: items.map((i) => i.plantTypeId) } }, select: { id: true, code: true } }),
  ]);
  if (!order) return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
  if (order.status !== "HELD" && order.status !== "CONFIRMED") return NextResponse.json({ message: `Đơn ${order.code} không còn ở trạng thái giữ/đã xác nhận` }, { status: 400 });
  if (!garden || !garden.isActive) return NextResponse.json({ message: "Vườn sản xuất không hợp lệ" }, { status: 400 });
  if (plantTypes.length !== new Set(items.map((i) => i.plantTypeId)).size) return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const code = await generateGardenPackRequestCode(tx);
    return tx.gardenPackRequest.create({
      data: {
        code, orderId, gardenId, notes: notes || null, createdById: session.user.id,
        items: { create: items.map((i) => ({ plantTypeId: i.plantTypeId, stageCode: i.stageCode, quantity: i.quantity, notes: i.notes || null })) },
      },
      select: { id: true, code: true },
    });
  });

  const total = items.reduce((s, i) => s + i.quantity, 0);
  if (garden.managerId) {
    await createAlert({
      type: "GARDEN_PACK_REQUEST_SENT",
      title: `Phiếu giao vườn ${created.code} — đơn ${order.code}`,
      message: `NV Điều phối ${session.user.name ?? ""} giao ${garden.name} đóng gói ${total.toLocaleString("vi-VN")} cây (${items.length} dòng) cho đơn ${order.code} (KH ${order.customerCode}).${notes ? ` Ghi chú: ${notes}` : ""}`,
      userId: garden.managerId, relatedId: created.id, relatedType: "GardenPackRequest",
    });
  }
  return NextResponse.json({
    success: true,
    message: garden.managerId ? `Đã gửi phiếu ${created.code} cho QLV ${garden.name}` : `Đã lập phiếu ${created.code} — ${garden.name} chưa có Quản lý vườn nhận thông báo`,
  });
}
