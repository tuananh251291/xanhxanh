import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { generateGardenCareTicketCode } from "@/lib/codes";
import { z } from "zod";

const schema = z.object({
  // NV chăm sóc cây mô phụ trách lô (GardenStaff) — bỏ trống = giữ nguyên.
  staffId: z.string().optional(),
  // fromRowId null = lấy từ phần chưa xếp của lô; khác null = điều chuyển từ dãy đó sang toRowId.
  items: z.array(z.object({ fromRowId: z.string().nullable(), toRowId: z.string().min(1), quantity: z.number().int().positive() })).default([]),
  notes: z.string().trim().max(500).optional(),
});

class FlowError extends Error {}

// Phiếu sắp xếp/điều chuyển vị trí cây của 1 lô chăm sóc — QLV lập và duyệt luôn (status CONFIRMED ngay), chỉ
// cập nhật số cây theo dãy (GardenCarePlacement) + NV phụ trách, KHÔNG đổi tồn kho. Xem model GardenCareTicket.
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
  if (items.length === 0 && (!staffId || staffId === lot.staffId)) return NextResponse.json({ message: "Chưa có thay đổi nào" }, { status: 400 });
  if (items.some((i) => i.fromRowId === i.toRowId)) return NextResponse.json({ message: "Dãy nguồn và dãy đích trùng nhau" }, { status: 400 });

  if (staffId) {
    const staff = await prisma.gardenStaff.findFirst({ where: { id: staffId, gardenId: lot.gardenId, isActive: true, types: { has: "CHAM_SOC_CAY_MO" } }, select: { id: true } });
    if (!staff) return NextResponse.json({ message: "NV chăm sóc cây mô không hợp lệ" }, { status: 400 });
  }
  const rowIds = [...new Set(items.flatMap((i) => [i.toRowId, ...(i.fromRowId ? [i.fromRowId] : [])]))];
  const rows = await prisma.gardenRow.findMany({
    where: { id: { in: rowIds }, rack: { house: { gardenId: lot.gardenId } } },
    select: { id: true, number: true, rack: { select: { letter: true, house: { select: { number: true } } } } },
  });
  if (rows.length !== rowIds.length) return NextResponse.json({ message: "Dãy không thuộc vườn này" }, { status: 400 });
  const labelOf = new Map(rows.map((r) => [r.id, `${r.rack.house.number}${r.rack.letter}${r.number}`]));

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      // Đọc lại số cây theo dãy trong transaction, kiểm tra đủ nguồn rồi mới chuyển.
      const current = await tx.gardenCareLot.findUniqueOrThrow({ where: { id }, select: { quantity: true, placements: { select: { rowId: true, quantity: true } } } });
      const byRow = new Map(current.placements.map((p) => [p.rowId, p.quantity]));
      let unplaced = current.quantity - current.placements.reduce((s, p) => s + p.quantity, 0);
      for (const it of items) {
        if (it.fromRowId === null) {
          if (it.quantity > unplaced) throw new FlowError(`Phần chưa xếp chỉ còn ${unplaced.toLocaleString("vi-VN")} cây`);
          unplaced -= it.quantity;
        } else {
          const have = byRow.get(it.fromRowId) ?? 0;
          if (it.quantity > have) throw new FlowError(`Dãy ${labelOf.get(it.fromRowId)} chỉ có ${have.toLocaleString("vi-VN")} cây của lô`);
          byRow.set(it.fromRowId, have - it.quantity);
        }
        byRow.set(it.toRowId, (byRow.get(it.toRowId) ?? 0) + it.quantity);
      }
      for (const [rowId, quantity] of byRow) {
        if (quantity > 0) {
          await tx.gardenCarePlacement.upsert({ where: { lotId_rowId: { lotId: id, rowId } }, create: { lotId: id, rowId, quantity }, update: { quantity } });
        } else {
          await tx.gardenCarePlacement.deleteMany({ where: { lotId: id, rowId } });
        }
      }
      if (staffId && staffId !== lot.staffId) await tx.gardenCareLot.update({ where: { id }, data: { staffId } });
      const now = new Date();
      const created = await tx.gardenCareTicket.create({
        data: {
          code: await generateGardenCareTicketCode(tx), gardenId: lot.gardenId, lotId: id, type: "PLACE", status: "CONFIRMED",
          staffId: staffId ?? lot.staffId, notes: notes || null, createdById: session.user.id, submittedAt: now, confirmedById: session.user.id, confirmedAt: now,
          items: { create: items.map((i) => ({ rowId: i.toRowId, fromRowId: i.fromRowId, reportedQuantity: i.quantity, confirmedQuantity: i.quantity })) },
        },
        select: { id: true, code: true },
      });
      const detail = items.map((i) => `${i.fromRowId ? labelOf.get(i.fromRowId) : "chưa xếp"} → ${labelOf.get(i.toRowId)}: ${i.quantity.toLocaleString("vi-VN")}`).join("; ");
      await tx.gardenCareLog.create({
        data: { ticketId: created.id, action: "CONFIRM", detail: `QLV sắp xếp & duyệt${detail ? ` — ${detail}` : ""}${staffId && staffId !== lot.staffId ? " (đổi NV phụ trách)" : ""}`, byId: session.user.id },
      });
      return created;
    });
    return NextResponse.json({ success: true, message: `Đã duyệt phiếu sắp xếp ${ticket.code}` }, { status: 201 });
  } catch (err) {
    if (err instanceof FlowError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
