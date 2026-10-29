import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canManageGarden } from "@/lib/garden-staff";
import { getRemainingByReceiptItem, getPoolStock } from "@/lib/garden-damage";
import { createCareLotsForReceipt } from "@/lib/garden-care";
import { GARDEN_STOCK_POOL_LABELS } from "@/lib/garden-receipt-constants";
import { z } from "zod";

const itemsSchema = z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0), notes: z.string().trim().max(300).optional() })).min(1);
const schema = z.discriminatedUnion("action", [
  // NV (người lập) lưu nháp / gửi QLV — số hỏng NV báo từng dòng.
  z.object({ action: z.literal("save"), items: itemsSchema, notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("submit"), items: itemsSchema, notes: z.string().trim().max(500).optional() }),
  // QLV trả lại yêu cầu NV kiểm tra, gửi lại.
  z.object({ action: z.literal("return"), reason: z.string().trim().min(1, "Nhập lý do trả lại").max(500) }),
  // QLV xác nhận (có thể sửa số trước khi xác nhận) — lúc này mới trừ tồn, đúng 1 lần.
  z.object({ action: z.literal("confirm"), items: itemsSchema }),
]);

class FlowError extends Error {}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const report = await prisma.gardenDamageReport.findUnique({
    where: { id },
    select: {
      id: true, code: true, status: true, flow: true, gardenId: true, createdById: true, receiptId: true,
      garden: { select: { name: true, managerId: true } }, receipt: { select: { code: true } },
      items: { select: { id: true, receiptItemId: true, plantTypeId: true, stageCode: true, reportedQuantity: true, plantType: { select: { code: true } } } },
    },
  });
  if (!report) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
  const itemById = new Map(report.items.map((i) => [i.id, i]));
  const label = (it: (typeof report.items)[number]) => `${it.plantType.code} ${it.stageCode}`;

  // Số nhập không vượt số còn ghi hỏng được của dòng phiếu bàn giao (thực nhận − đã ghi hỏng ở phiếu khác).
  const checkItems = async (items: z.infer<typeof itemsSchema>) => {
    if (items.some((i) => !itemById.has(i.itemId)) || new Set(items.map((i) => i.itemId)).size !== report.items.length) {
      throw new FlowError("Cần nhập đủ mọi dòng của phiếu");
    }
    const remaining = await getRemainingByReceiptItem(report.items.map((i) => i.receiptItemId), report.id);
    for (const row of items) {
      const it = itemById.get(row.itemId)!;
      const max = remaining.get(it.receiptItemId) ?? 0;
      if (row.quantity > max) throw new FlowError(`${label(it)}: số hỏng ${row.quantity.toLocaleString("vi-VN")} vượt số còn lại ${max.toLocaleString("vi-VN")}`);
    }
  };
  const summary = (items: z.infer<typeof itemsSchema>) =>
    items.map((r) => `${label(itemById.get(r.itemId)!)}: ${r.quantity.toLocaleString("vi-VN")}`).join("; ");

  try {
    if (data.action === "save" || data.action === "submit") {
      if (report.createdById !== session.user.id) return NextResponse.json({ message: "Chỉ người lập phiếu được sửa/gửi" }, { status: 403 });
      if (report.status !== "DRAFT" && report.status !== "RETURNED") return NextResponse.json({ message: "Phiếu đã gửi QLV" }, { status: 400 });
      await checkItems(data.items);
      const submit = data.action === "submit";
      // Gửi phiếu toàn 0 cây hỏng vẫn được — QLV xác nhận là đã kiểm tra, không có cây hỏng.
      await prisma.$transaction(async (tx) => {
        const locked = await tx.gardenDamageReport.updateMany({
          where: { id, status: { in: ["DRAFT", "RETURNED"] } },
          data: { notes: data.notes || null, ...(submit ? { status: "SUBMITTED", submittedAt: new Date() } : {}) },
        });
        if (locked.count === 0) throw new FlowError("Phiếu vừa được cập nhật — tải lại trang");
        for (const row of data.items) {
          await tx.gardenDamageItem.update({ where: { id: row.itemId }, data: { reportedQuantity: row.quantity, notes: row.notes || null } });
        }
        if (submit) await tx.gardenDamageLog.create({ data: { reportId: id, action: "SUBMIT", detail: `Gửi QLV — ${summary(data.items)}`, byId: session.user.id } });
      });
      if (submit) {
        const recipients = report.garden.managerId
          ? [report.garden.managerId]
          : (await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } })).map((u) => u.id);
        for (const userId of recipients) {
          await createAlert({
            type: "GARDEN_DAMAGE_SUBMITTED", title: "Có phiếu ghi nhận cây hỏng chờ xác nhận",
            message: `${session.user.name} gửi phiếu ${report.code} (phiếu bàn giao ${report.receipt.code}) — ${summary(data.items)}.`,
            userId, relatedId: id, relatedType: "GardenDamageReport",
          });
        }
      }
      return NextResponse.json({ success: true, message: submit ? "Đã gửi phiếu cho QLV xác nhận" : "Đã lưu nháp" });
    }

    // return / confirm — Quản lý vườn của vườn (hoặc Admin).
    if (!(await canManageGarden(session.user, report.gardenId))) return NextResponse.json({ message: "Chỉ Quản lý vườn được xác nhận/trả lại" }, { status: 403 });
    if (report.status !== "SUBMITTED") return NextResponse.json({ message: "Phiếu chưa được gửi hoặc đã xử lý" }, { status: 400 });

    if (data.action === "return") {
      await prisma.$transaction(async (tx) => {
        const locked = await tx.gardenDamageReport.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: "RETURNED", returnReason: data.reason } });
        if (locked.count === 0) throw new FlowError("Phiếu vừa được cập nhật — tải lại trang");
        await tx.gardenDamageLog.create({ data: { reportId: id, action: "RETURN", detail: `Trả lại: ${data.reason}`, byId: session.user.id } });
      });
      await createAlert({
        type: "GARDEN_DAMAGE_RETURNED", title: "Phiếu ghi nhận cây hỏng bị trả lại",
        message: `QLV trả lại phiếu ${report.code}: ${data.reason} — kiểm tra lại và gửi lại.`,
        userId: report.createdById, relatedId: id, relatedType: "GardenDamageReport",
      });
      return NextResponse.json({ success: true, message: "Đã trả lại phiếu cho NV kiểm tra" });
    }

    // confirm
    await checkItems(data.items);
    const edits = data.items
      .filter((r) => r.quantity !== itemById.get(r.itemId)!.reportedQuantity)
      .map((r) => `${label(itemById.get(r.itemId)!)}: ${itemById.get(r.itemId)!.reportedQuantity.toLocaleString("vi-VN")} → ${r.quantity.toLocaleString("vi-VN")}`);
    await prisma.$transaction(async (tx) => {
      const locked = await tx.gardenDamageReport.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "CONFIRMED", confirmedById: session.user.id, confirmedAt: new Date() },
      });
      if (locked.count === 0) throw new FlowError("Phiếu vừa được xử lý — tải lại trang");
      // Trừ tồn kho tương ứng (Kho nhiễm / Kho cây trồng) — không vượt tồn hiện có.
      const stock = await getPoolStock(report.gardenId, report.flow, tx);
      const needByKey = new Map<string, number>();
      for (const row of data.items) {
        const it = itemById.get(row.itemId)!;
        const key = `${it.plantTypeId}:${it.stageCode}`;
        needByKey.set(key, (needByKey.get(key) ?? 0) + row.quantity);
      }
      for (const [key, qty] of needByKey) {
        if (qty <= 0) continue;
        const [plantTypeId, stageCode] = key.split(":");
        const have = stock.get(key) ?? 0;
        const it = report.items.find((i) => i.plantTypeId === plantTypeId && i.stageCode === stageCode)!;
        if (qty > have) throw new FlowError(`${label(it)}: số hỏng ${qty.toLocaleString("vi-VN")} vượt tồn ${GARDEN_STOCK_POOL_LABELS[report.flow]} (${have.toLocaleString("vi-VN")})`);
        const dec = await tx.gardenStock.updateMany({
          where: { gardenId: report.gardenId, pool: report.flow, plantTypeId, stageCode, quantity: { gte: qty } },
          data: { quantity: { decrement: qty } },
        });
        if (dec.count !== 1) throw new FlowError(`${label(it)}: tồn vừa thay đổi — tải lại trang`);
      }
      for (const row of data.items) await tx.gardenDamageItem.update({ where: { id: row.itemId }, data: { confirmedQuantity: row.quantity } });
      // Nghiệp vụ 4: số cây còn lại (thực nhận − hỏng đã duyệt) tự chuyển thành lô chăm sóc cây mô.
      await createCareLotsForReceipt(tx, report.receiptId);
      await tx.gardenDamageLog.create({
        data: {
          reportId: id, action: "CONFIRM",
          detail: `Xác nhận — ${summary(data.items)}${edits.length ? ` (QLV sửa: ${edits.join("; ")})` : ""}`,
          byId: session.user.id,
        },
      });
    });
    await createAlert({
      type: "GARDEN_DAMAGE_CONFIRMED", title: "Phiếu ghi nhận cây hỏng đã được xác nhận",
      message: `QLV đã xác nhận phiếu ${report.code}${edits.length ? ` (có sửa số: ${edits.join("; ")})` : ""}.`,
      userId: report.createdById, relatedId: id, relatedType: "GardenDamageReport",
    });
    return NextResponse.json({ success: true, message: `Đã xác nhận — trừ số cây hỏng khỏi ${GARDEN_STOCK_POOL_LABELS[report.flow]}, số cây còn lại chuyển sang Chăm sóc cây mô` });
  } catch (err) {
    if (err instanceof FlowError) return NextResponse.json({ message: err.message }, { status: 400 });
    throw err;
  }
}
