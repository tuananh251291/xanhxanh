import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { addMonths, parse, isValid } from "date-fns";

// Danh sách phiếu bàn giao (Phòng tối → Kho sáng) của chính NV cấy mô đang đăng nhập, kèm đối chiếu
// "số lượng bàn giao" (TransferItem.quantity, qua lô) với "số lượng ghi nhận":
// - Luồng Xanh: không qua bước Kiểm tra, luôn tin tưởng tuyệt đối — ghi nhận = số đã bàn giao trừ đúng
//   số "không đạt" (VD cây quá nhỏ) NV tự khai lúc bàn giao (TransferItem.unqualifiedQuantity), không ai
//   sửa lại được.
// - Luồng Đỏ (hoặc chưa cài đặt luồng): ghi nhận = TransferInspectionItem.creditedQuantity (đã trừ cả
//   nhiễm lẫn không đạt do Kho mô xác nhận), chỉ có sau khi Kho mô bấm "Kiểm tra" (xem
//   /api/transfers/receive-phong-toi/inspect/[transferId]) — trước đó trả về null (đang chờ kiểm tra).
//   1 phiếu có thể có NHIỀU dòng TransferInspectionItem cùng stageCode (mỗi dòng 1 mã cây khác nhau, xem
//   schema) — hiển thị ở đây vẫn gộp theo stageCode (cộng dồn các dòng cùng stageCode) vì UI này chỉ cần
//   tổng theo quy cách, không cần tách mã cây (khác payroll-calculation.ts, tách hẳn theo mã cây).
//
// Query param "month" (YYYY-MM, tùy chọn) — lọc theo 1 KỲ (không phải tháng lịch), tính theo
// Transfer.createdAt (thời điểm NV bấm bàn giao): từ ngày 7 của tháng chọn tới TRƯỚC ngày 7 tháng sau
// (khớp kỳ tính lương của công ty). VD chọn "2026-08" → kỳ 07/08 - 06/09. Không truyền = kỳ hiện tại
// (mặc định), tránh tải toàn bộ lịch sử mỗi lần mở.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const PERIOD_START_DAY = 7;
  const monthParam = req.nextUrl.searchParams.get("month");
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const monthDate = isValid(parsedMonth) ? parsedMonth : new Date();
  // Nếu hôm nay/ngày tham chiếu chưa tới mùng 7, kỳ hiện tại thật ra bắt đầu từ mùng 7 THÁNG TRƯỚC —
  // chỉ áp dụng khi không truyền "month" tường minh (mặc định theo ngày hôm nay).
  const anchorMonth = !monthParam && monthDate.getDate() < PERIOD_START_DAY ? addMonths(monthDate, -1) : monthDate;
  const rangeStart = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), PERIOD_START_DAY, 0, 0, 0, 0);
  const rangeEnd = addMonths(rangeStart, 1);

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { inspectionLane: true },
  });

  const transfers = await prisma.transfer.findMany({
    where: {
      fromUserId: session.user.id,
      fromRoom: { type: "PHONG_TOI" },
      createdAt: { gte: rangeStart, lt: rangeEnd },
    },
    include: {
      items: {
        include: {
          lot: {
            select: { code: true, stageCode: true, quantity: true, enteredAt: true, darkRoomEnteredAt: true, plantType: { select: { code: true, name: true } } },
          },
        },
      },
      inspection: { include: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const isXanh = me?.inspectionLane === "XANH";

  // Tổng theo quy cách (M05/T05/T01...) cộng dồn TOÀN BỘ tháng đang lọc — cộng cả recordedQuantity null
  // (luồng Đỏ chưa kiểm tra) là 0, không tính vào "đã ghi nhận" vì thực tế chưa có con số nào cả.
  const totalsByStage = new Map<string, { handedOver: number; recorded: number }>();

  const result = transfers.map((t) => {
    const groups = new Map<
      string,
      {
        stageCode: string;
        handedOverQuantity: number;
        unqualifiedQuantity: number;
        lots: { lotCode: string; plantTypeCode: string; plantTypeName: string; quantity: number; enteredAt: Date }[];
      }
    >();
    for (const item of t.items) {
      const key = item.lot.stageCode;
      const group = groups.get(key) ?? { stageCode: key, handedOverQuantity: 0, unqualifiedQuantity: 0, lots: [] };
      group.handedOverQuantity += item.quantity;
      group.unqualifiedQuantity += item.unqualifiedQuantity;
      group.lots.push({
        lotCode: item.lot.code,
        plantTypeCode: item.lot.plantType.code,
        plantTypeName: item.lot.plantType.name,
        quantity: item.quantity,
        // Ưu tiên darkRoomEnteredAt (ngày nhập kho tối GỐC, bất biến) — enteredAt bị commitShelfPlacements
        // ghi đè thành ngày lên kệ ngay khi Kho mô xác nhận, không còn đáng tin ở đây (xem
        // dark-room-shelf-commit.ts). Fallback về enteredAt cho lô cũ tạo trước khi có field này (chấp
        // nhận có thể sai với lô đã lên kệ — không còn cách khôi phục ngày gốc).
        enteredAt: item.lot.darkRoomEnteredAt ?? item.lot.enteredAt,
      });
      groups.set(key, group);
    }

    const creditedByStageCode = new Map<string, number>();
    for (const i of t.inspection?.items ?? []) {
      creditedByStageCode.set(i.stageCode, (creditedByStageCode.get(i.stageCode) ?? 0) + i.creditedQuantity);
    }

    const resultGroups = [...groups.values()].map((g) => {
      const recordedQuantity = isXanh ? g.handedOverQuantity - g.unqualifiedQuantity : (t.inspection ? (creditedByStageCode.get(g.stageCode) ?? null) : null);
      const stageTotal = totalsByStage.get(g.stageCode) ?? { handedOver: 0, recorded: 0 };
      stageTotal.handedOver += g.handedOverQuantity;
      stageTotal.recorded += recordedQuantity ?? 0;
      totalsByStage.set(g.stageCode, stageTotal);
      return { ...g, recordedQuantity };
    });

    return {
      id: t.id,
      code: t.code,
      // Từ góc nhìn NV cấy mô, phiếu luồng Đỏ coi như "Đã xác nhận" ngay khi Kho mô kiểm tra xong —
      // không cần đợi Kho mô xếp kệ xong (bước xử lý nội bộ sau đó, NV cấy mô không cần quan tâm).
      // Transfer.status thật sự chỉ chuyển CONFIRMED khi hết mọi lô đã xếp kệ (xem receive-phong-toi.ts).
      status: t.inspection && t.status === "PENDING" ? "CONFIRMED" : t.status,
      createdAt: t.createdAt,
      inspected: !!t.inspection,
      groups: resultGroups,
    };
  });

  return NextResponse.json({
    lane: me?.inspectionLane ?? null,
    month: `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}`,
    rangeStart,
    rangeEnd,
    totalsByStage: Object.fromEntries(totalsByStage),
    transfers: result,
  });
}
