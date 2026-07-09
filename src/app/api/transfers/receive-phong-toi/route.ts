import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG } from "@/types";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { lotSelect, buildStagePreview, confirmStage, type PendingItem } from "@/lib/receive-phong-toi";
import { z } from "zod";

// Danh sách phiếu bàn giao Phòng tối đang chờ (chưa xếp hết) của 1 NV luồng Xanh, gộp mọi Transfer
// PENDING của họ lại — 1 NV có thể gửi nhiều phiếu khác ngày trước khi Kho mô xử lý.
async function findPendingItems(
  staffId: string
): Promise<{ items: PendingItem[]; transfers: { code: string; transferredAt: Date }[] }> {
  const transfers = await prisma.transfer.findMany({
    where: {
      status: "PENDING",
      fromUserId: staffId,
      fromRoom: { type: "PHONG_TOI" },
      // notes là field nullable — Prisma dịch `not` thành SQL `<>`, tự động loại cả các dòng NULL
      // (đa số phiếu thường không phải surplus nên notes luôn null). Phải liệt kê rõ null lẫn "khác
      // SURPLUS_TRANSFER_TAG" bằng OR để không vô tình loại hết phiếu bình thường.
      OR: [{ notes: null }, { notes: { not: SURPLUS_TRANSFER_TAG } }],
    },
    select: {
      id: true,
      code: true,
      transferredAt: true,
      items: {
        where: { confirmedAt: null },
        select: { id: true, lotId: true, transferId: true, lot: { select: lotSelect } },
      },
    },
    orderBy: { transferredAt: "asc" },
  });
  const withPendingItems = transfers.filter((t) => t.items.length > 0);
  return {
    items: withPendingItems.flatMap((t) => t.items),
    transfers: withPendingItems.map((t) => ({ code: t.code, transferredAt: t.transferredAt })),
  };
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json([]);

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId, inspectionLane: "XANH" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const rows = [];
  for (const staff of staffList) {
    const { items: pendingItems, transfers } = await findPendingItems(staff.id);
    if (pendingItems.length === 0) continue;

    const preview = await buildStagePreview(pendingItems, workplaceWarehouseId);

    rows.push({
      staffId: staff.id,
      staffCode: staff.code,
      staffName: staff.name,
      transfers,
      // Danh sách lô gộp chung (không tách ra rễ/mẫu mẹ) — dùng cho bảng tổng hợp; trang chi tiết
      // "Sắp xếp vào kho" dùng rootingPlacements/motherPlacements bên dưới để tách riêng theo từng lô.
      items: pendingItems.map((i) => ({ lotCode: i.lot.code, stageCode: i.lot.stageCode, quantity: i.lot.quantity })),
      ...preview,
    });
  }

  return NextResponse.json(rows);
}

const confirmSchema = z.object({
  staffId: z.string(),
  stage: z.enum(["THANH_PHAM", "MAU_ME"]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, stage } = parsed.data;

  // Xác thực lại luồng phía server — không tin bộ lọc phía client.
  const staff = await prisma.user.findUnique({
    where: { id: staffId },
    select: { role: true, inspectionLane: true, workplaceWarehouseId: true },
  });
  if (!staff || staff.role !== "CAY_MO" || staff.inspectionLane !== "XANH" || staff.workplaceWarehouseId !== workplaceWarehouseId) {
    return NextResponse.json({ message: "Nhân viên không hợp lệ hoặc không thuộc luồng Xanh" }, { status: 400 });
  }

  const { items: pendingItems } = await findPendingItems(staffId);
  const matchingItems = pendingItems.filter((i) => i.lot.stage === stage);
  if (matchingItems.length === 0) {
    return NextResponse.json({ message: "Không có lô nào đang chờ xếp cho nhân viên này" }, { status: 400 });
  }

  let placements;
  try {
    placements = await confirmStage(matchingItems, workplaceWarehouseId);
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }

  return NextResponse.json({
    success: true,
    placements: placements.map((p) => ({ lotCode: p.lot.code, shelfCode: p.shelfCode, quantity: p.quantity, pool: p.pool })),
  });
}
