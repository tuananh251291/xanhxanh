import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { applyStockCountDelta, refreshStockCountSnapshot } from "@/lib/stock-count";
import { canDecideStockCount, canEditStockCount, canViewStockCount, isStockCountEditable } from "@/lib/stock-count-shared";

type Params = { params: Promise<{ id: string }> };

async function loadReport(id: string) {
  return prisma.stockCountReport.findUnique({
    where: { id },
    include: {
      warehouse: { select: { code: true, name: true } },
      createdBy: { select: { name: true, code: true } },
      decidedBy: { select: { name: true } },
      items: {
        include: { room: { select: { name: true, type: true } }, plantType: { select: { code: true, name: true } } },
        orderBy: [{ room: { name: "asc" } }, { plantType: { code: "asc" } }, { stageCode: "asc" }],
      },
    },
  });
}

// Quản lý kho chỉ đụng báo cáo của kho mình; người xem khác không xem bản nháp (chưa gửi lần nào).
function canAccess(session: Session | null, report: { warehouseId: string; status: string; submittedAt: Date | null }) {
  const role = session?.user?.role;
  if (!canViewStockCount(role)) return false;
  if (canEditStockCount(role)) return session!.user.workplaceWarehouseId === report.warehouseId;
  return report.status !== "DRAFT" || report.submittedAt !== null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  const report = await loadReport(id);
  if (!report || !canAccess(session, report)) return NextResponse.json({ message: "Không tìm thấy báo cáo" }, { status: 404 });
  return NextResponse.json(report);
}

const saveSchema = z.object({
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  proposal: z.string().max(5000).nullable().optional(),
  items: z
    .array(z.object({ id: z.string(), actualQuantity: z.number().int().min(0).nullable(), explanation: z.string().max(2000).nullable() }))
    .optional(),
});

// Lưu nháp: ngày kiểm kê, hướng xử lý, số thực tế + giải trình từng dòng.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  const report = await prisma.stockCountReport.findUnique({ where: { id }, select: { id: true, warehouseId: true, status: true, submittedAt: true } });
  if (!report || !canAccess(session, report) || !canEditStockCount(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền sửa báo cáo này" }, { status: 403 });
  }
  if (!isStockCountEditable(report.status)) return NextResponse.json({ message: "Báo cáo đã gửi, không sửa được" }, { status: 400 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { countDate, proposal, items } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.stockCountReport.update({
      where: { id },
      data: {
        ...(countDate ? { countDate: new Date(countDate) } : {}),
        ...(proposal !== undefined ? { proposal: proposal?.trim() || null } : {}),
      },
    });
    for (const item of items ?? []) {
      await tx.stockCountItem.updateMany({
        where: { id: item.id, reportId: id },
        data: { actualQuantity: item.actualQuantity, explanation: item.explanation?.trim() || null },
      });
    }
  });
  return NextResponse.json(await loadReport(id));
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("recheck"), note: z.string().trim().min(1, "Nhập nội dung cần kiểm tra lại").max(2000) }),
  z.object({ action: z.literal("apply") }),
]);

const monthLabel = (r: { month: number; year: number }) => `tháng ${r.month}/${r.year}`;

// refresh/submit: Quản lý kho. recheck/apply: Admin cấp cao, chỉ khi báo cáo đang chờ xem (SUBMITTED).
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  const report = await prisma.stockCountReport.findUnique({
    where: { id },
    include: {
      warehouse: { select: { name: true } },
      createdBy: { select: { code: true } },
      items: { include: { plantType: { select: { code: true } } } },
    },
  });
  if (!report || !session?.user || !canAccess(session, report)) return NextResponse.json({ message: "Không tìm thấy báo cáo" }, { status: 404 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const body = parsed.data;
  const role = session.user.role;
  const label = `${report.warehouse.name} ${monthLabel(report)}`;

  if (body.action === "refresh" || body.action === "submit") {
    if (!canEditStockCount(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    if (!isStockCountEditable(report.status)) return NextResponse.json({ message: "Báo cáo đã gửi, không sửa được" }, { status: 400 });

    if (body.action === "refresh") {
      await prisma.$transaction((tx) => refreshStockCountSnapshot(id, report.warehouseId, tx));
      return NextResponse.json(await loadReport(id));
    }

    const missing = report.items.filter((i) => i.actualQuantity == null).length;
    if (missing) return NextResponse.json({ message: `Còn ${missing} dòng chưa nhập tồn kho thực tế` }, { status: 400 });
    const unexplained = report.items.filter((i) => i.actualQuantity !== i.systemQuantity && !i.explanation?.trim()).length;
    if (unexplained) return NextResponse.json({ message: `Còn ${unexplained} dòng có chênh lệch chưa giải trình` }, { status: 400 });

    const mismatched = report.items.filter((i) => i.actualQuantity !== i.systemQuantity).length;
    await prisma.$transaction([
      prisma.stockCountReport.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), recheckNote: null } }),
      prisma.alert.createMany({
        data: (["SUPER_ADMIN", "TRO_LY", "HANH_CHINH_NHAN_SU"] as const).map((targetRole) => ({
          type: "STOCK_COUNT_SUBMITTED" as const,
          targetRole,
          title: `Báo cáo đối chiếu tồn kho ${label}`,
          message: `${session.user.name ?? "Quản lý kho"} đã gửi báo cáo: ${report.items.length} mã, ${mismatched} mã có chênh lệch.`,
          relatedId: id,
          relatedType: "StockCountReport",
        })),
      }),
    ]);
    return NextResponse.json(await loadReport(id));
  }

  if (!canDecideStockCount(role)) return NextResponse.json({ message: "Chỉ Admin cấp cao được duyệt báo cáo" }, { status: 403 });
  if (report.status !== "SUBMITTED") return NextResponse.json({ message: "Báo cáo không ở trạng thái chờ duyệt" }, { status: 400 });

  // Báo cho người lập + Trợ lý + HCNS biết kết quả.
  const notify = (type: "STOCK_COUNT_RECHECK_REQUESTED" | "STOCK_COUNT_APPLIED", title: string, message: string) => [
    { type, userId: report.createdById, title, message, relatedId: id, relatedType: "StockCountReport" },
    ...(["TRO_LY", "HANH_CHINH_NHAN_SU"] as const).map((targetRole) => ({ type, targetRole, title, message, relatedId: id, relatedType: "StockCountReport" })),
  ];

  if (body.action === "recheck") {
    await prisma.$transaction([
      prisma.stockCountReport.update({
        where: { id },
        data: { status: "RECHECK_REQUESTED", recheckNote: body.note, decidedById: session.user.id, decidedAt: new Date() },
      }),
      prisma.alert.createMany({ data: notify("STOCK_COUNT_RECHECK_REQUESTED", `Yêu cầu kiểm tra lại tồn kho ${label}`, body.note) }),
    ]);
    return NextResponse.json(await loadReport(id));
  }

  // apply — cộng/trừ đúng phần chênh lệch vào tồn hiện tại, khoá báo cáo.
  const changed = report.items.filter((i) => i.actualQuantity != null && i.actualQuantity !== i.systemQuantity);
  await prisma.$transaction(
    async (tx) => {
      for (const item of changed) {
        const applied = await applyStockCountDelta(
          tx,
          { roomId: item.roomId, plantTypeId: item.plantTypeId, stageCode: item.stageCode, plantTypeCode: item.plantType.code },
          item.actualQuantity! - item.systemQuantity,
          report.createdBy.code
        );
        await tx.stockCountItem.update({ where: { id: item.id }, data: { appliedDelta: applied } });
      }
      const now = new Date();
      await tx.stockCountReport.update({ where: { id }, data: { status: "APPLIED", appliedAt: now, decidedById: session.user.id, decidedAt: now } });
      await tx.alert.createMany({
        data: notify(
          "STOCK_COUNT_APPLIED",
          `Đã áp số liệu thực tế tồn kho ${label}`,
          `Admin cấp cao đã áp số thực tế làm tồn đầu kỳ tháng sau — điều chỉnh ${changed.length} mã có chênh lệch.`
        ),
      });
    },
    { timeout: 60000 }
  );
  return NextResponse.json(await loadReport(id));
}
