import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ShelfAssignError } from "@/lib/shelf-assignment";
import { findPendingItems, confirmStage, confirmStageManual } from "@/lib/receive-phong-toi";
import { z } from "zod";

// Danh sách phiếu bàn giao Phòng tối đang chờ theo từng NV luồng Xanh — CHỈ liệt kê (không tính kệ gợi
// ý ở đây). Trước đây gọi buildStagePreview (planShelfAssignments) cho MỌI lô của MỌI NV ngay khi tải
// trang này khiến trang rất chậm so với luồng Đỏ (do-lane/route.ts, không tính kệ gợi ý) — trong khi
// receive-phong-toi-board.tsx (bảng danh sách) không hề dùng tới kết quả preview đó, chỉ trang chi tiết
// "Sắp xếp vào kho" của TỪNG NV mới cần (xem place-staff/[staffId]/route.ts, tính preview đúng 1 NV lúc
// KHO_MO thật sự bấm vào, không tính trước cho cả danh sách).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json([]);

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId, inspectionLane: "XANH" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const rows = [];
  for (const staff of staffList) {
    const { items: pendingItems, transfers } = await findPendingItems(staff.id);
    if (pendingItems.length === 0) continue;

    rows.push({
      staffId: staff.id,
      staffCode: staff.code,
      staffName: staff.name,
      transfers,
      items: pendingItems.map((i) => ({ lotCode: i.lot.code, stageCode: i.lot.stageCode, quantity: i.lot.quantity, enteredAt: i.lot.enteredAt })),
    });
  }

  return NextResponse.json(rows);
}

const confirmSchema = z.object({
  staffId: z.string(),
  stage: z.enum(["THANH_PHAM", "MAU_ME"]),
  // Có mặt = chỉ xác nhận ĐÚNG 1 lô (xem LotGroup ở receive-phong-toi.ts) thay vì cả stage — mỗi lô xác
  // nhận độc lập, không còn bắt buộc xử lý xong hết mọi lô cùng stage mới xác nhận được lô đầu tiên.
  // Không truyền = xác nhận toàn bộ stage (giữ tương thích ngược, hiện không còn UI nào gọi kiểu này).
  lotId: z.string().optional(),
  // Có mặt = KHO_MO chọn tự nhập kệ (bỏ qua nguyên tắc), chỉ hợp lệ khi stage = MAU_ME — xem
  // confirmStageManual (src/lib/receive-phong-toi.ts). min(0) thay vì positive() — cho phép dòng kệ nhập
  // số lượng 0 (dòng dự phòng KHO_MO thêm rồi không dùng tới) đi qua validate, confirmStageManual tự lọc
  // bỏ trước khi xử lý.
  manualPlacements: z.array(z.object({ shelfCode: z.string().trim().min(1), quantity: z.number().int().min(0) })).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { staffId, stage, lotId, manualPlacements } = parsed.data;
  if (manualPlacements && stage !== "MAU_ME") {
    return NextResponse.json({ message: "Chỉ hỗ trợ tự nhập kệ cho mẫu mẹ" }, { status: 400 });
  }

  // Xác thực lại luồng phía server — không tin bộ lọc phía client.
  const staff = await prisma.user.findUnique({
    where: { id: staffId },
    select: { role: true, inspectionLane: true, workplaceWarehouseId: true },
  });
  if (!staff || staff.role !== "CAY_MO" || staff.inspectionLane !== "XANH" || staff.workplaceWarehouseId !== workplaceWarehouseId) {
    return NextResponse.json({ message: "Nhân viên không hợp lệ hoặc không thuộc luồng Xanh" }, { status: 400 });
  }

  const { items: pendingItems } = await findPendingItems(staffId);
  let matchingItems = pendingItems.filter((i) => i.lot.stage === stage);
  if (lotId) matchingItems = matchingItems.filter((i) => i.lotId === lotId);
  if (matchingItems.length === 0) {
    return NextResponse.json({ message: "Không có lô nào đang chờ xếp cho nhân viên này" }, { status: 400 });
  }

  let placements;
  try {
    placements = manualPlacements
      ? await confirmStageManual(matchingItems, manualPlacements, workplaceWarehouseId)
      : await confirmStage(matchingItems, workplaceWarehouseId);
  } catch (e) {
    if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
    throw e;
  }

  return NextResponse.json({
    success: true,
    placements: placements.map((p) => ({ lotCode: p.lot.code, shelfCode: p.shelfCode, quantity: p.quantity, pool: p.pool })),
  });
}
