import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canApproveInvoice, canCreateInvoice, invoiceSaveSchema, invoiceScopeFor } from "@/lib/invoice";
import { saveInvoice } from "@/lib/invoice-save";

async function findVisible(id: string, user: { id: string; role: string | null | undefined }) {
  return prisma.invoice.findFirst({
    where: { id, ...(await invoiceScopeFor(user)) },
    include: {
      market: { select: { id: true, code: true, name: true, currency: true, derivedCurrency: true, invoiceCalcKind: true } },
      order: { select: { id: true, code: true, status: true } },
      companyProfile: true,
      createdBy: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  const inv = await findVisible(id, session.user);
  if (!inv) return NextResponse.json({ message: "Không tìm thấy invoice" }, { status: 404 });
  return NextResponse.json(inv);
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), data: invoiceSaveSchema }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1, "Nhập lý do từ chối").max(500) }),
  z.object({ action: z.literal("cancel") }),
]);

// update: người lập sửa (invoice gắn đơn đã xác nhận thì khoá) — tính lại, có giá tay thì chờ duyệt lại.
// approve/reject: Admin cấp cao duyệt giá nhập tay. cancel: người lập / Admin cấp cao huỷ (đơn đã xác nhận thì khoá).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const inv = await findVisible(id, session.user);
  if (!inv) return NextResponse.json({ message: "Không tìm thấy invoice" }, { status: 404 });
  const body = parsed.data;
  const orderLocked = !!inv.order && inv.order.status !== "HELD" && inv.order.status !== "DRAFT" && inv.order.status !== "CANCELLED";

  if (body.action === "approve" || body.action === "reject") {
    if (!canApproveInvoice(session.user.role)) return NextResponse.json({ message: "Chỉ Admin cấp cao được duyệt" }, { status: 403 });
    const done = await prisma.invoice.updateMany({
      where: { id, status: "PENDING_APPROVAL", updatedAt: inv.updatedAt },
      data: {
        status: body.action === "approve" ? "APPROVED" : "REJECTED", decidedById: session.user.id, decidedAt: new Date(),
        rejectionReason: body.action === "reject" ? body.reason : null,
      },
    });
    if (done.count === 0) return NextResponse.json({ message: "Invoice đã được xử lý hoặc vừa bị sửa — tải lại trang" }, { status: 409 });
    await createAlert({
      type: "INVOICE_DECIDED",
      title: body.action === "approve" ? `Invoice ${inv.invoiceNo} đã được duyệt giá` : `Invoice ${inv.invoiceNo} bị từ chối`,
      message: body.action === "approve" ? `Có thể in PDF${inv.order ? " và xác nhận đơn " + inv.order.code : ""}.` : `Lý do: ${body.reason} — sửa lại giá rồi lưu để gửi duyệt lại.`,
      userId: inv.createdBy.id,
      relatedId: id,
      relatedType: "Invoice",
    });
    return NextResponse.json({ success: true });
  }

  const isOwner = inv.createdBy.id === session.user.id;
  if (!(isOwner && canCreateInvoice(session.user.role)) && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ người lập invoice được sửa/huỷ" }, { status: 403 });
  }
  if (orderLocked) return NextResponse.json({ message: `Đơn ${inv.order!.code} đã xác nhận — không sửa/huỷ invoice được nữa` }, { status: 400 });
  if (inv.status === "CANCELLED") return NextResponse.json({ message: "Invoice đã huỷ" }, { status: 400 });

  if (body.action === "cancel") {
    await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ success: true });
  }
  const out = await saveInvoice(session.user, body.data, id);
  if (!out.ok) return NextResponse.json({ message: out.message, blockers: out.blockers }, { status: out.status });
  return NextResponse.json(out);
}
