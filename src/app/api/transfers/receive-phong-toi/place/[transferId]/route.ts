import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { lotSelect, buildStagePreview, confirmStage, confirmStageManual } from "@/lib/receive-phong-toi";
import { z } from "zod";

async function loadTransfer(transferId: string, workplaceWarehouseId: string) {
  return prisma.transfer.findFirst({
    where: { id: transferId, fromRoom: { type: "PHONG_TOI", warehouseId: workplaceWarehouseId } },
    include: {
      fromUser: { select: { id: true, code: true, name: true } },
      inspection: { select: { id: true } },
      items: {
        where: { confirmedAt: null },
        select: { id: true, lotId: true, transferId: true, lot: { select: lotSelect } },
      },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  const transfer = await loadTransfer(transferId, workplaceWarehouseId);
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy phiếu bàn giao" }, { status: 404 });
  if (!transfer.inspection) return NextResponse.json({ message: "Cần kiểm tra trước khi sắp xếp về kho" }, { status: 400 });

  const preview = await buildStagePreview(transfer.items, workplaceWarehouseId);

  return NextResponse.json({
    transferCode: transfer.code,
    staffCode: transfer.fromUser.code,
    staffName: transfer.fromUser.name,
    ...preview,
  });
}

const confirmSchema = z.object({
  stage: z.enum(["THANH_PHAM", "MAU_ME"]),
  manualPlacements: z.array(z.object({ shelfCode: z.string().trim().min(1), quantity: z.number().int().positive() })).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { stage, manualPlacements } = parsed.data;
  if (manualPlacements && stage !== "MAU_ME") {
    return NextResponse.json({ message: "Chỉ hỗ trợ tự nhập kệ cho mẫu mẹ" }, { status: 400 });
  }

  const transfer = await loadTransfer(transferId, workplaceWarehouseId);
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy phiếu bàn giao" }, { status: 404 });
  if (!transfer.inspection) return NextResponse.json({ message: "Cần kiểm tra trước khi sắp xếp về kho" }, { status: 400 });

  const matchingItems = transfer.items.filter((i) => i.lot.stage === stage);
  if (matchingItems.length === 0) {
    return NextResponse.json({ message: "Không có lô nào đang chờ xếp cho nhóm này" }, { status: 400 });
  }

  let placements;
  try {
    placements = manualPlacements
      ? await confirmStageManual(matchingItems, manualPlacements, workplaceWarehouseId)
      : await confirmStage(matchingItems, workplaceWarehouseId);
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }

  return NextResponse.json({
    success: true,
    placements: placements.map((p) => ({ lotCode: p.lot.code, shelfCode: p.shelfCode, quantity: p.quantity, pool: p.pool })),
  });
}
