import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateGardenDamageCode } from "@/lib/codes";
import { canCreateDamageReport } from "@/lib/garden-damage";
import { z } from "zod";

const schema = z.object({ receiptId: z.string().min(1, "Chưa chọn phiếu bàn giao") });

// Mở phiếu ghi nhận cây hỏng (DRAFT) từ 1 phiếu bàn giao cây mô ĐÃ NHẬN (COMPLETED) — luồng A/B theo loại lệnh
// của phiếu bàn giao, mỗi dòng = 1 dòng phiếu bàn giao (số lượng ban đầu = số thực nhận). Mỗi phiếu bàn giao
// chỉ có tối đa 1 phiếu hỏng đang mở (chưa xác nhận) cùng lúc.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const receipt = await prisma.gardenReceipt.findUnique({
    where: { id: parsed.data.receiptId },
    select: { id: true, code: true, gardenId: true, status: true, orderType: true, items: { select: { id: true, plantTypeId: true, stageCode: true, receivedQuantity: true } } },
  });
  if (!receipt || receipt.status !== "COMPLETED") return NextResponse.json({ message: "Phiếu bàn giao chưa nhận xong vào kho vườn" }, { status: 400 });
  if (!(await canCreateDamageReport(session.user, receipt.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const open = await prisma.gardenDamageReport.findFirst({ where: { receiptId: receipt.id, status: { not: "CONFIRMED" } }, select: { id: true, code: true } });
  if (open) return NextResponse.json({ message: `Phiếu bàn giao ${receipt.code} đang có phiếu hỏng ${open.code} chưa xác nhận`, id: open.id }, { status: 409 });

  const report = await prisma.$transaction(async (tx) =>
    tx.gardenDamageReport.create({
      data: {
        code: await generateGardenDamageCode(tx),
        gardenId: receipt.gardenId,
        receiptId: receipt.id,
        flow: receipt.orderType,
        createdById: session.user.id,
        items: {
          create: receipt.items.map((it) => ({
            receiptItemId: it.id, plantTypeId: it.plantTypeId, stageCode: it.stageCode, initialQuantity: it.receivedQuantity ?? 0,
          })),
        },
      },
      select: { id: true, code: true },
    })
  );
  return NextResponse.json(report, { status: 201 });
}
