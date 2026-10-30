import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { generateGardenCareTicketCode } from "@/lib/codes";
import { CARE_POOLS } from "@/lib/garden-care";
import { moveStock, cleanupEmptyLines, InventoryError } from "@/lib/garden-inventory";
import { z } from "zod";

const schema = z.object({
  // NV chăm sóc cây mô phụ trách lô (GardenStaff) — bỏ trống = giữ nguyên.
  staffId: z.string().optional(),
  // Lấy từ 1 dòng tồn của lô (chưa xếp hoặc đang ở 1 dãy) → dãy đích.
  items: z.array(z.object({ fromLineId: z.string().min(1), toRowId: z.string().min(1), quantity: z.number().int().positive() })).default([]),
  notes: z.string().trim().max(500).optional(),
});

// Phiếu sắp xếp/điều chuyển vị trí cây của 1 lô chăm sóc — QLV lập và duyệt luôn (CONFIRMED ngay): chuyển số cây
// giữa các dòng tồn của lô (đổi vị trí dãy) + đổi NV phụ trách, KHÔNG đổi tồn kho (xem moveStock).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, items, notes } = parsed.data;

  const lot = await prisma.gardenCareLot.findUnique({ where: { id }, select: { id: true, code: true, gardenId: true, staffId: true } });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });
  if (!(await canManageGarden(session.user, lot.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được sắp xếp vị trí" }, { status: 403 });
  const staffChanged = !!staffId && staffId !== lot.staffId;
  if (items.length === 0 && !staffChanged) return NextResponse.json({ message: "Chưa có thay đổi nào" }, { status: 400 });
  if (staffId) {
    const staff = await prisma.gardenStaff.findFirst({ where: { id: staffId, gardenId: lot.gardenId, isActive: true, types: { has: "CHAM_SOC_CAY_MO" } }, select: { id: true } });
    if (!staff) return NextResponse.json({ message: "NV chăm sóc cây mô không hợp lệ" }, { status: 400 });
  }

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const lines = await tx.gardenStockLine.findMany({ where: { lotId: id, pool: { in: [...CARE_POOLS] } }, select: { id: true, rowId: true } });
      const lineById = new Map(lines.map((l) => [l.id, l]));
      for (const it of items) {
        const src = lineById.get(it.fromLineId);
        if (!src) throw new InventoryError("Dòng tồn nguồn không thuộc lô đang chăm sóc");
        if (src.rowId === it.toRowId) throw new InventoryError("Dãy nguồn và dãy đích trùng nhau");
        await moveStock(tx, { lineId: it.fromLineId, quantity: it.quantity, toRowId: it.toRowId, type: "PLACE", note: notes ?? null, byId: session.user.id });
      }
      // Đổi NV phụ trách lô: mọi dòng tồn của lô đang chăm sóc chuyển sang NV mới.
      if (staffChanged) {
        await tx.gardenCareLot.update({ where: { id }, data: { staffId } });
        const current = await tx.gardenStockLine.findMany({ where: { lotId: id, pool: { in: [...CARE_POOLS] }, quantity: { gt: 0 } }, select: { id: true, quantity: true, staffId: true } });
        for (const l of current) {
          if (l.staffId === staffId) continue;
          await moveStock(tx, { lineId: l.id, quantity: l.quantity, toStaffId: staffId, type: "PLACE", note: "Đổi NV phụ trách lô", byId: session.user.id });
        }
      }
      await cleanupEmptyLines(tx, lot.gardenId);
      const now = new Date();
      return tx.gardenCareTicket.create({
        data: {
          code: await generateGardenCareTicketCode(tx), gardenId: lot.gardenId, lotId: id, type: "PLACE", status: "CONFIRMED",
          staffId: staffId ?? lot.staffId, notes: notes || null, createdById: session.user.id, submittedAt: now, confirmedById: session.user.id, confirmedAt: now,
          items: { create: items.map((i) => ({ rowId: i.toRowId, fromRowId: lineById.get(i.fromLineId)!.rowId, reportedQuantity: i.quantity, confirmedQuantity: i.quantity })) },
          logs: { create: { action: "CONFIRM", detail: `QLV sắp xếp & duyệt ${items.length} dòng${staffChanged ? " (đổi NV phụ trách)" : ""}`, byId: session.user.id } },
        },
        select: { code: true },
      });
    }, { timeout: 30000 });
    return NextResponse.json({ success: true, message: `Đã duyệt phiếu sắp xếp ${ticket.code}` }, { status: 201 });
  } catch (err) {
    if (err instanceof InventoryError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
