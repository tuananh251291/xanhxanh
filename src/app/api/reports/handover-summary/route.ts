import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { addMonths, parse, isValid } from "date-fns";

const PERIOD_START_DAY = 7;

// Báo cáo "Bàn giao & ghi nhận theo tháng" — cho Admin + NV Hành chính nhân sự (chỉ xem) — tổng hợp
// TOÀN BỘ NV cấy mô (không chỉ 1 người như /api/transfers/my-handovers), lọc được theo cơ sở sản xuất.
// Cùng công thức "số lượng ghi nhận" với my-handovers/route.ts:
// - Luồng Xanh: không qua Kiểm tra, ghi nhận = đã bàn giao trừ số "không đạt" NV tự khai.
// - Luồng Đỏ (hoặc chưa cài luồng): ghi nhận = TransferInspectionItem.creditedQuantity (Kho mô xác nhận
//   sau khi kiểm tra) — phiếu chưa kiểm tra thì phần đó CHƯA cộng vào ghi nhận (hasPending=true để FE báo
//   "còn phiếu đang chờ kiểm tra", tránh hiểu nhầm số ghi nhận thấp là NV làm kém). 1 phiếu có thể có
//   NHIỀU dòng TransferInspectionItem cùng stageCode (mỗi dòng 1 mã cây, xem schema) — báo cáo này gộp
//   theo stageCode (cộng dồn) vì chỉ cần tổng theo NV, không cần tách mã cây.
// Cùng "kỳ lương" mùng 7 - trước mùng 7 tháng sau (không phải tháng lịch) — khớp quy ước công ty.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const warehouseId = searchParams.get("warehouseId") || undefined;

  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const monthDate = isValid(parsedMonth) ? parsedMonth : new Date();
  const anchorMonth = !monthParam && monthDate.getDate() < PERIOD_START_DAY ? addMonths(monthDate, -1) : monthDate;
  const rangeStart = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), PERIOD_START_DAY, 0, 0, 0, 0);
  const rangeEnd = addMonths(rangeStart, 1);

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
    select: {
      id: true, code: true, name: true, inspectionLane: true,
      workplaceWarehouse: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const staffIds = staffList.map((s) => s.id);
  const laneByStaff = new Map(staffList.map((s) => [s.id, s.inspectionLane]));

  const transfers = staffIds.length === 0 ? [] : await prisma.transfer.findMany({
    where: {
      fromUserId: { in: staffIds },
      fromRoom: { type: "PHONG_TOI" },
      createdAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: {
      fromUserId: true,
      items: { select: { quantity: true, unqualifiedQuantity: true, lot: { select: { stageCode: true } } } },
      inspection: { select: { items: { select: { stageCode: true, creditedQuantity: true } } } },
    },
  });

  const byStaff = new Map<string, { handedOver: number; recorded: number; hasPending: boolean }>();
  for (const t of transfers) {
    const isXanh = laneByStaff.get(t.fromUserId) === "XANH";
    const entry = byStaff.get(t.fromUserId) ?? { handedOver: 0, recorded: 0, hasPending: false };

    const groups = new Map<string, { handedOver: number; unqualified: number }>();
    for (const item of t.items) {
      const g = groups.get(item.lot.stageCode) ?? { handedOver: 0, unqualified: 0 };
      g.handedOver += item.quantity;
      g.unqualified += item.unqualifiedQuantity;
      groups.set(item.lot.stageCode, g);
    }
    const creditedByStage = new Map<string, number>();
    for (const i of t.inspection?.items ?? []) {
      creditedByStage.set(i.stageCode, (creditedByStage.get(i.stageCode) ?? 0) + i.creditedQuantity);
    }
    for (const [stageCode, g] of groups) {
      entry.handedOver += g.handedOver;
      if (isXanh) {
        entry.recorded += g.handedOver - g.unqualified;
      } else if (t.inspection) {
        entry.recorded += creditedByStage.get(stageCode) ?? 0;
      } else {
        entry.hasPending = true;
      }
    }
    byStaff.set(t.fromUserId, entry);
  }

  const rows = staffList
    .map((s) => {
      const entry = byStaff.get(s.id) ?? { handedOver: 0, recorded: 0, hasPending: false };
      return {
        staffId: s.id,
        staffCode: s.code,
        staffName: s.name,
        warehouseName: s.workplaceWarehouse?.name ?? null,
        lane: s.inspectionLane,
        handedOverQuantity: entry.handedOver,
        recordedQuantity: entry.recorded,
        hasPending: entry.hasPending,
      };
    })
    .sort((a, b) => b.handedOverQuantity - a.handedOverQuantity || a.staffName.localeCompare(b.staffName));

  const totalHandedOver = rows.reduce((s, r) => s + r.handedOverQuantity, 0);
  const totalRecorded = rows.reduce((s, r) => s + r.recordedQuantity, 0);

  return NextResponse.json({
    month: `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}`,
    rangeStart,
    rangeEnd,
    rows,
    summary: { totalHandedOver, totalRecorded, staffCount: rows.length },
  });
}
