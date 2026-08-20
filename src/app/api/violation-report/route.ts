import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, isValid } from "date-fns";

// Báo cáo vi phạm — tổng số lỗi vi phạm mỗi NV cấy mô bị ghi nhận trong khoảng thời gian (mặc định tháng
// hiện tại). Admin/Admin cấp cao xem toàn bộ (lọc thêm được theo 1 cơ sở sản xuất qua ?warehouseId=, xem
// WarehouseFilterSelect), Kho mô chỉ xem đúng NV cùng kho sản xuất mình làm việc — cùng phạm vi
// canManageDailyRecords, y hệt /api/daily-record-edits/weekly-summary (bỏ qua ?warehouseId= nếu có gửi
// lên). NV Hành chính nhân sự (chỉ xem) cũng xem toàn bộ như Admin — không gán theo kho sản xuất, cũng
// lọc được theo ?warehouseId=.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const canFilterByWarehouse = isAdminRole(role) || role === "HANH_CHINH_NHAN_SU";
  if (!canFilterByWarehouse && role !== "KHO_MO") {
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
  const warehouseId = canFilterByWarehouse ? searchParams.get("warehouseId")?.trim() || null : null;

  const records = await prisma.violationRecord.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(role === "KHO_MO"
        ? { staff: { workplaceWarehouseId: session!.user!.workplaceWarehouseId } }
        : warehouseId
          ? { staff: { workplaceWarehouseId: warehouseId } }
          : {}),
    },
    include: {
      violationType: { select: { label: true } },
      staff: { select: { id: true, code: true, name: true } },
      createdBy: { select: { code: true, name: true } },
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
    const staff = r.staff;
    const row = {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      violationLabel: r.violationType.label,
      checkedByCode: r.createdBy.code,
      checkedByName: r.createdBy.name,
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
