import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { applySalesManagerRows, validateSalesManagerRows, type SalesManagerImportRow } from "@/lib/sales-manager-import";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), note: z.string().trim().max(2000).optional() }),
]);

// Admin cấp cao duyệt / từ chối yêu cầu nhập Excel phân công của NV Trợ lý. Duyệt: kiểm tra lại toàn bộ dòng
// theo dữ liệu hiện tại (lỗi → không áp, báo lỗi), rồi áp trong 1 transaction.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao được duyệt" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const request = await prisma.salesManagerImportRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ message: "Không tìm thấy yêu cầu" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ message: "Yêu cầu đã được xử lý" }, { status: 400 });

  const now = new Date();
  if (parsed.data.action === "reject") {
    const note = parsed.data.note || null;
    await prisma.$transaction([
      prisma.salesManagerImportRequest.update({ where: { id }, data: { status: "REJECTED", decidedById: session.user.id, decidedAt: now, note } }),
      prisma.alert.create({
        data: {
          type: "SALES_MANAGER_IMPORT_DECIDED",
          userId: request.createdById,
          title: "Phân công Nhân viên quản lý bị từ chối",
          message: `File "${request.fileName}" không được duyệt${note ? `: ${note}` : ""}.`,
          relatedId: id,
          relatedType: "SalesManagerImportRequest",
        },
      }),
    ]);
    return NextResponse.json({ message: "Đã từ chối yêu cầu" });
  }

  const { errors, resolved } = await validateSalesManagerRows(request.rows as unknown as SalesManagerImportRow[]);
  if (errors.length) {
    return NextResponse.json({ message: `Dữ liệu đã thay đổi từ lúc gửi — ${errors.length} dòng không còn hợp lệ, không thể duyệt. Hãy từ chối để Trợ lý tải lại file.`, errors }, { status: 400 });
  }
  const result = await prisma.$transaction(async (tx) => {
    const applied = await applySalesManagerRows(tx, resolved);
    await tx.salesManagerImportRequest.update({ where: { id }, data: { status: "APPROVED", decidedById: session.user.id, decidedAt: now } });
    await tx.alert.create({
      data: {
        type: "SALES_MANAGER_IMPORT_DECIDED",
        userId: request.createdById,
        title: "Phân công Nhân viên quản lý đã được duyệt",
        message: `File "${request.fileName}" đã áp dụng: ${applied.created} phân công mới, ${applied.updated} đổi NV quản lý.`,
        relatedId: id,
        relatedType: "SalesManagerImportRequest",
      },
    });
    return applied;
  });
  return NextResponse.json({ message: `Đã duyệt: ${result.created} phân công mới, ${result.updated} đổi NV quản lý` });
}
