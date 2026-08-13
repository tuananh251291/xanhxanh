import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, isValid } from "date-fns";

// Báo cáo vi phạm — tổng số lỗi vi phạm mỗi NV cấy mô bị ghi nhận trong khoảng thời gian (mặc định tháng
// hiện tại). Admin/Admin cấp cao xem toàn bộ, Kho mô chỉ xem đúng NV cùng kho sản xuất mình làm việc —
// cùng phạm vi canManageDailyRecords, y hệt /api/daily-record-edits/weekly-summary.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && !session?.user?.workplaceWarehouseId) {
    return NextResponse.json({ staffList: [] });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam && isValid(new Date(fromParam)) ? startOfDay(new Date(fromParam)) : startOfMonth(new Date());
  const to = toParam && isValid(new Date(toParam)) ? endOfDay(new Date(toParam)) : endOfMonth(new Date());

  const records = await prisma.violationRecord.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(role === "KHO_MO" ? { inspectionCheck: { staff: { workplaceWarehouseId: session!.user!.workplaceWarehouseId } } } : {}),
    },
    include: {
      violationType: { select: { label: true } },
      inspectionCheck: {
        select: {
          checkedAt: true,
          staff: { select: { id: true, code: true, name: true } },
          checkedBy: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const byStaff = new Map<
    string,
    {
      staffId: string;
      staffCode: string;
      staffName: string;
      count: number;
      records: { id: string; createdAt: string; violationLabel: string; checkedByCode: string; checkedByName: string }[];
    }
  >();
  for (const r of records) {
    const staff = r.inspectionCheck.staff;
    const row = {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      violationLabel: r.violationType.label,
      checkedByCode: r.inspectionCheck.checkedBy.code,
      checkedByName: r.inspectionCheck.checkedBy.name,
    };
    const existing = byStaff.get(staff.id);
    if (existing) {
      existing.count += 1;
      existing.records.push(row);
    } else {
      byStaff.set(staff.id, { staffId: staff.id, staffCode: staff.code, staffName: staff.name, count: 1, records: [row] });
    }
  }

  const staffList = Array.from(byStaff.values()).sort((a, b) => b.count - a.count);
  return NextResponse.json({ staffList });
}
