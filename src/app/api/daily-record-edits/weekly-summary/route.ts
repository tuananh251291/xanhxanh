import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfWeek, endOfWeek } from "date-fns";

// Bảng theo dõi "số lần Admin/Kho mô đã sửa nhật ký cấy" của từng NV cấy mô trong tuần này — mỗi dòng
// DailyRecordEdit là 1 lần sửa THỰC SỰ đổi số liệu (xem changed ở PATCH /api/daily-records/[id]), nghĩa
// là NV đã nhập sai và cần người khác chỉnh lại. Admin/Admin cấp cao xem toàn bộ, Kho mô chỉ xem đúng NV
// cùng kho sản xuất mình làm việc (khớp phạm vi canManageDailyRecords).
export async function GET() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (role === "KHO_MO" && !session?.user?.workplaceWarehouseId) {
    return NextResponse.json({ staffList: [] });
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const edits = await prisma.dailyRecordEdit.findMany({
    where: {
      createdAt: { gte: weekStart, lte: weekEnd },
      ...(role === "KHO_MO" ? { staff: { workplaceWarehouseId: session!.user!.workplaceWarehouseId } } : {}),
    },
    include: {
      staff: { select: { id: true, code: true, name: true } },
      editedBy: { select: { code: true, name: true } },
      dailyRecord: { select: { recordDate: true, instruction: { select: { code: true } } } },
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
      edits: { id: string; createdAt: string; editedByCode: string; editedByName: string; instructionCode: string; recordDate: string }[];
    }
  >();
  for (const e of edits) {
    const existing = byStaff.get(e.staff.id);
    const row = {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      editedByCode: e.editedBy.code,
      editedByName: e.editedBy.name,
      instructionCode: e.dailyRecord.instruction.code,
      recordDate: e.dailyRecord.recordDate.toISOString(),
    };
    if (existing) {
      existing.count += 1;
      existing.edits.push(row);
    } else {
      byStaff.set(e.staff.id, {
        staffId: e.staff.id,
        staffCode: e.staff.code,
        staffName: e.staff.name,
        count: 1,
        edits: [row],
      });
    }
  }

  const staffList = Array.from(byStaff.values()).sort((a, b) => b.count - a.count);
  return NextResponse.json({ staffList });
}
