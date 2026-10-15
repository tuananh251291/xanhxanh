import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageSaleCustomers } from "@/types";
import { validateSalesManagerRows, type SalesManagerImportRow } from "@/lib/sales-manager-import";

// Yêu cầu nhập Excel phân công: Admin cấp cao thấy mọi yêu cầu, NV Trợ lý thấy yêu cầu của mình. Yêu cầu
// đang chờ kèm bản xem trước so với phân công HIỆN TẠI (thêm mới / đổi quản lý / không đổi / lỗi).
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !canManageSaleCustomers(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const requests = await prisma.salesManagerImportRequest.findMany({
    where: role === "SUPER_ADMIN" ? {} : { createdById: session.user.id },
    include: { createdBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const out = await Promise.all(
    requests.map(async ({ rows, ...r }) => {
      if (r.status !== "PENDING") return r;
      const { errors, resolved } = await validateSalesManagerRows(rows as unknown as SalesManagerImportRow[]);
      return { ...r, preview: resolved, errors };
    })
  );
  return NextResponse.json(out);
}
