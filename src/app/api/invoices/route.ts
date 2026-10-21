import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canCreateInvoice, canViewAllInvoices, invoiceSaveSchema, invoiceScopeFor } from "@/lib/invoice";
import { saveInvoice } from "@/lib/invoice-save";

// Danh sách invoice trong phạm vi được xem, lọc theo trạng thái / tháng lập (yyyy-MM).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(canCreateInvoice(session.user.role) || canViewAllInvoices(session.user.role))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const month = sp.get("month");
  const where: Record<string, unknown> = { ...(await invoiceScopeFor(session.user)) };
  if (status && ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) where.status = status;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    where.invoiceDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, invoiceNo: true, invoiceDate: true, currency: true, total: true, status: true, hasManualPrice: true,
      customerName: true, createdAt: true, rejectionReason: true,
      market: { select: { code: true, name: true } },
      order: { select: { id: true, code: true, status: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canCreateInvoice(session.user.role)) return NextResponse.json({ message: "Không có quyền lập phiếu báo giá" }, { status: 403 });
  const parsed = invoiceSaveSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const out = await saveInvoice(session.user, parsed.data, null);
  if (!out.ok) return NextResponse.json({ message: out.message, blockers: out.blockers }, { status: out.status });
  return NextResponse.json(out);
}
