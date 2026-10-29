import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canManageGarden } from "@/lib/garden-staff";
import { rowLabel } from "@/lib/garden-care";
import { GARDEN_CARE_TICKET_LABELS, GARDEN_STOCK_POOL_LABELS, GARDEN_SIZE_S_STAGE } from "@/lib/garden-receipt-constants";
import { z } from "zod";

const itemsSchema = z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0), notes: z.string().trim().max(300).optional() })).min(1);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), items: itemsSchema, notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("submit"), items: itemsSchema, notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("return"), reason: z.string().trim().min(1, "Nhập lý do trả lại").max(500) }),
  z.object({ action: z.literal("confirm"), items: itemsSchema }),
]);

class FlowError extends Error {}

// Phiếu cây hỏng khi chăm sóc (DAMAGE) / cây đạt size S (SIZE_S) của 1 lô chăm sóc cây mô — NV lập → gửi → QLV sửa
// số + duyệt hoặc trả lại. Duyệt (1 lần duy nhất): trừ ĐÚNG số duyệt khỏi dãy (GardenCarePlacement), lô
// (GardenCareLot.quantity) và kho nguồn (GardenStock — Kho nhiễm/Kho cây trồng theo lô); SIZE_S cộng thêm vào Kho
// thành phẩm vườn (GardenFinishedStock, quy cách S, không còn phân biệt nhiễm/khỏe).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const ticket = await prisma.gardenCareTicket.findUnique({
    where: { id },
    select: {
      id: true, code: true, type: true, status: true, gardenId: true, lotId: true, createdById: true,
      garden: { select: { managerId: true } },
      lot: { select: { code: true, pool: true, plantTypeId: true, stageCode: true, plantType: { select: { code: true } } } },
      items: { select: { id: true, rowId: true, reportedQuantity: true, row: { select: { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } } } },
    },
  });
  if (!ticket) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
  if (ticket.type === "PLACE") return NextResponse.json({ message: "Phiếu sắp xếp đã duyệt khi lập" }, { status: 400 });
  const itemById = new Map(ticket.items.map((i) => [i.id, i]));
  const label = (itemId: string) => rowLabel(itemById.get(itemId)!.row);
  const summary = (items: z.infer<typeof itemsSchema>) => items.map((r) => `${label(r.itemId)}: ${r.quantity.toLocaleString("vi-VN")}`).join("; ");
  const typeLabel = GARDEN_CARE_TICKET_LABELS[ticket.type];

  // Số nhập mỗi dãy không vượt số cây của lô đang ở dãy đó.
  const checkItems = async (items: z.infer<typeof itemsSchema>, client: Pick<typeof prisma, "gardenCarePlacement"> = prisma) => {
    if (items.some((i) => !itemById.has(i.itemId)) || new Set(items.map((i) => i.itemId)).size !== ticket.items.length) throw new FlowError("Cần nhập đủ mọi dòng của phiếu");
    const placements = await client.gardenCarePlacement.findMany({ where: { lotId: ticket.lotId }, select: { rowId: true, quantity: true } });
    const byRow = new Map(placements.map((p) => [p.rowId, p.quantity]));
    for (const r of items) {
      const have = byRow.get(itemById.get(r.itemId)!.rowId) ?? 0;
      if (r.quantity > have) throw new FlowError(`Dãy ${label(r.itemId)}: ${r.quantity.toLocaleString("vi-VN")} vượt số cây của lô ở dãy (${have.toLocaleString("vi-VN")})`);
    }
  };

  try {
    if (data.action === "save" || data.action === "submit") {
      if (ticket.createdById !== session.user.id) return NextResponse.json({ message: "Chỉ người lập phiếu được sửa/gửi" }, { status: 403 });
      if (ticket.status !== "DRAFT" && ticket.status !== "RETURNED") return NextResponse.json({ message: "Phiếu đã gửi QLV" }, { status: 400 });
      await checkItems(data.items);
      const submit = data.action === "submit";
      await prisma.$transaction(async (tx) => {
        const locked = await tx.gardenCareTicket.updateMany({
          where: { id, status: { in: ["DRAFT", "RETURNED"] } },
          data: { notes: data.notes || null, ...(submit ? { status: "SUBMITTED", submittedAt: new Date() } : {}) },
        });
        if (locked.count === 0) throw new FlowError("Phiếu vừa được cập nhật — tải lại trang");
        for (const r of data.items) await tx.gardenCareTicketItem.update({ where: { id: r.itemId }, data: { reportedQuantity: r.quantity, notes: r.notes || null } });
        if (submit) await tx.gardenCareLog.create({ data: { ticketId: id, action: "SUBMIT", detail: `Gửi QLV — ${summary(data.items)}`, byId: session.user.id } });
      });
      if (submit) {
        const recipients = ticket.garden.managerId
          ? [ticket.garden.managerId]
          : (await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } })).map((u) => u.id);
        for (const userId of recipients) {
          await createAlert({
            type: "GARDEN_CARE_SUBMITTED", title: `${typeLabel} chờ duyệt`,
            message: `${session.user.name} gửi phiếu ${ticket.code} (lô ${ticket.lot.code}, ${ticket.lot.plantType.code}) — ${summary(data.items)}.`,
            userId, relatedId: id, relatedType: "GardenCareTicket",
          });
        }
      }
      return NextResponse.json({ success: true, message: submit ? "Đã gửi phiếu cho QLV duyệt" : "Đã lưu nháp" });
    }

    if (!(await canManageGarden(session.user, ticket.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được duyệt/trả lại" }, { status: 403 });
    if (ticket.status !== "SUBMITTED") return NextResponse.json({ message: "Phiếu chưa được gửi hoặc đã xử lý" }, { status: 400 });

    if (data.action === "return") {
      await prisma.$transaction(async (tx) => {
        const locked = await tx.gardenCareTicket.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: "RETURNED", returnReason: data.reason } });
        if (locked.count === 0) throw new FlowError("Phiếu vừa được cập nhật — tải lại trang");
        await tx.gardenCareLog.create({ data: { ticketId: id, action: "RETURN", detail: `Trả lại: ${data.reason}`, byId: session.user.id } });
      });
      await createAlert({
        type: "GARDEN_CARE_RETURNED", title: `${typeLabel} bị trả lại`,
        message: `QLV trả lại phiếu ${ticket.code} (lô ${ticket.lot.code}): ${data.reason} — kiểm tra lại và gửi lại.`,
        userId: ticket.createdById, relatedId: id, relatedType: "GardenCareTicket",
      });
      return NextResponse.json({ success: true, message: "Đã trả lại phiếu cho NV kiểm tra" });
    }

    // confirm — trừ dãy + lô + kho nguồn (+ cộng Kho thành phẩm nếu SIZE_S), đúng 1 lần.
    const total = data.items.reduce((s, r) => s + r.quantity, 0);
    const edits = data.items
      .filter((r) => r.quantity !== itemById.get(r.itemId)!.reportedQuantity)
      .map((r) => `${label(r.itemId)}: ${itemById.get(r.itemId)!.reportedQuantity.toLocaleString("vi-VN")} → ${r.quantity.toLocaleString("vi-VN")}`);
    const { pool, plantTypeId, stageCode } = ticket.lot;
    await prisma.$transaction(async (tx) => {
      const locked = await tx.gardenCareTicket.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: "CONFIRMED", confirmedById: session.user.id, confirmedAt: new Date() } });
      if (locked.count === 0) throw new FlowError("Phiếu vừa được xử lý — tải lại trang");
      await checkItems(data.items, tx);
      for (const r of data.items) {
        await tx.gardenCareTicketItem.update({ where: { id: r.itemId }, data: { confirmedQuantity: r.quantity } });
        if (r.quantity <= 0) continue;
        const rowId = itemById.get(r.itemId)!.rowId;
        const dec = await tx.gardenCarePlacement.updateMany({ where: { lotId: ticket.lotId, rowId, quantity: { gte: r.quantity } }, data: { quantity: { decrement: r.quantity } } });
        if (dec.count !== 1) throw new FlowError(`Dãy ${label(r.itemId)}: số cây vừa thay đổi — tải lại trang`);
      }
      await tx.gardenCarePlacement.deleteMany({ where: { lotId: ticket.lotId, quantity: { lte: 0 } } });
      if (total > 0) {
        const lotDec = await tx.gardenCareLot.updateMany({ where: { id: ticket.lotId, quantity: { gte: total } }, data: { quantity: { decrement: total } } });
        if (lotDec.count !== 1) throw new FlowError("Số cây của lô vừa thay đổi — tải lại trang");
        const stockDec = await tx.gardenStock.updateMany({
          where: { gardenId: ticket.gardenId, pool, plantTypeId, stageCode, quantity: { gte: total } },
          data: { quantity: { decrement: total } },
        });
        if (stockDec.count !== 1) throw new FlowError(`${GARDEN_STOCK_POOL_LABELS[pool]} không đủ ${total.toLocaleString("vi-VN")} cây ${ticket.lot.plantType.code} ${stageCode}`);
        if (ticket.type === "SIZE_S") {
          await tx.gardenFinishedStock.upsert({
            where: { gardenId_plantTypeId_stageCode: { gardenId: ticket.gardenId, plantTypeId, stageCode: GARDEN_SIZE_S_STAGE } },
            create: { gardenId: ticket.gardenId, plantTypeId, stageCode: GARDEN_SIZE_S_STAGE, quantity: total },
            update: { quantity: { increment: total } },
          });
        }
      }
      await tx.gardenCareLog.create({
        data: { ticketId: id, action: "CONFIRM", detail: `Duyệt — ${summary(data.items)}${edits.length ? ` (QLV sửa: ${edits.join("; ")})` : ""}`, byId: session.user.id },
      });
    });
    await createAlert({
      type: "GARDEN_CARE_CONFIRMED", title: `${typeLabel} đã được duyệt`,
      message: `QLV đã duyệt phiếu ${ticket.code} (lô ${ticket.lot.code})${edits.length ? ` — có sửa số: ${edits.join("; ")}` : ""}.`,
      userId: ticket.createdById, relatedId: id, relatedType: "GardenCareTicket",
    });
    const message = ticket.type === "SIZE_S"
      ? `Đã duyệt — ${total.toLocaleString("vi-VN")} cây đạt size S chuyển từ ${GARDEN_STOCK_POOL_LABELS[pool]} sang Kho thành phẩm vườn`
      : `Đã duyệt — trừ ${total.toLocaleString("vi-VN")} cây hỏng khỏi ${GARDEN_STOCK_POOL_LABELS[pool]} và giàn/kệ`;
    return NextResponse.json({ success: true, message });
  } catch (err) {
    if (err instanceof FlowError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
