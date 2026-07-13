import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Danh sách phiếu bàn giao (Phòng tối → Kho sáng) của chính NV cấy mô đang đăng nhập, kèm đối chiếu
// "số lượng bàn giao" (TransferItem.quantity, qua lô) với "số lượng ghi nhận":
// - Luồng Xanh: không qua bước Kiểm tra, luôn tin tưởng — ghi nhận = đúng số đã bàn giao.
// - Luồng Đỏ (hoặc chưa cài đặt luồng): ghi nhận = TransferInspectionItem.creditedQuantity, chỉ có
//   sau khi Kho mô bấm "Kiểm tra" (xem /api/transfers/receive-phong-toi/inspect/[transferId]) — trước
//   đó trả về null (đang chờ kiểm tra). creditedQuantity tính theo TỪNG stageCode gộp cả phiếu (có thể
//   gộp nhiều lô khác loại cây cùng stageCode), nên gom theo stageCode chứ không tách theo từng lô.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { inspectionLane: true },
  });

  const transfers = await prisma.transfer.findMany({
    where: { fromUserId: session.user.id, fromRoom: { type: "PHONG_TOI" } },
    include: {
      items: {
        include: {
          lot: {
            select: { code: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
          },
        },
      },
      inspection: { include: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const isXanh = me?.inspectionLane === "XANH";

  const result = transfers.map((t) => {
    const groups = new Map<
      string,
      { stageCode: string; handedOverQuantity: number; lots: { lotCode: string; plantTypeCode: string; plantTypeName: string; quantity: number }[] }
    >();
    for (const item of t.items) {
      const key = item.lot.stageCode;
      const group = groups.get(key) ?? { stageCode: key, handedOverQuantity: 0, lots: [] };
      group.handedOverQuantity += item.quantity;
      group.lots.push({
        lotCode: item.lot.code,
        plantTypeCode: item.lot.plantType.code,
        plantTypeName: item.lot.plantType.name,
        quantity: item.quantity,
      });
      groups.set(key, group);
    }

    const creditedByStageCode = new Map((t.inspection?.items ?? []).map((i) => [i.stageCode, i.creditedQuantity]));

    return {
      id: t.id,
      code: t.code,
      // Từ góc nhìn NV cấy mô, phiếu luồng Đỏ coi như "Đã xác nhận" ngay khi Kho mô kiểm tra xong —
      // không cần đợi Kho mô xếp kệ xong (bước xử lý nội bộ sau đó, NV cấy mô không cần quan tâm).
      // Transfer.status thật sự chỉ chuyển CONFIRMED khi hết mọi lô đã xếp kệ (xem receive-phong-toi.ts).
      status: t.inspection && t.status === "PENDING" ? "CONFIRMED" : t.status,
      createdAt: t.createdAt,
      inspected: !!t.inspection,
      groups: [...groups.values()].map((g) => ({
        ...g,
        recordedQuantity: isXanh ? g.handedOverQuantity : (t.inspection ? (creditedByStageCode.get(g.stageCode) ?? null) : null),
      })),
    };
  });

  return NextResponse.json({ lane: me?.inspectionLane ?? null, transfers: result });
}
