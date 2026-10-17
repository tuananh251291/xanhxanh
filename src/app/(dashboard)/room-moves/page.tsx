import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { getRoomMoveRooms, getMovableLots, summarizeMovable } from "@/lib/room-move";
import RoomMoveBoard, { type StockOption, type MoveHistory } from "./room-move-board";

async function stockOptions(roomId: string, isStandardRoom: boolean): Promise<StockOption[]> {
  const byKey = summarizeMovable(await getMovableLots(roomId, isStandardRoom));
  if (byKey.size === 0) return [];
  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: [...new Set([...byKey.keys()].map((k) => k.split(":")[0]))] } },
    select: { id: true, code: true, name: true },
  });
  const ptById = new Map(plantTypes.map((p) => [p.id, p]));
  return [...byKey]
    .map(([key, quantity]) => {
      const [plantTypeId, stageCode] = key.split(":");
      const pt = ptById.get(plantTypeId)!;
      return { plantTypeId, plantTypeCode: pt.code, plantTypeName: pt.name, stageCode, quantity };
    })
    .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode) || a.stageCode.localeCompare(b.stageCode));
}

// "Luân chuyển nội bộ" — Quản lý kho thành phẩm chuyển cây qua lại Phòng đạt tiêu chuẩn ⇄ Phòng chờ xử lý
// của kho đang làm việc. Xem POST /api/room-moves.
export default async function RoomMovesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "QUAN_LY_KHO_THANH_PHAM" || !(await isPageAllowed(role, "/room-moves"))) redirect("/dashboard");
  const warehouseId = session?.user?.workplaceWarehouseId;
  if (!warehouseId) return <p className="text-sm text-destructive">Bạn chưa được gán kho làm việc — liên hệ Admin.</p>;

  const { standardRoom, processingRoom } = await getRoomMoveRooms(warehouseId);
  if (!standardRoom || !processingRoom) {
    return <p className="text-sm text-destructive">Kho chưa có đủ Phòng đạt tiêu chuẩn và Phòng chờ xử lý — liên hệ Admin.</p>;
  }

  const [standardStock, processingStock, moves] = await Promise.all([
    stockOptions(standardRoom.id, true),
    stockOptions(processingRoom.id, false),
    prisma.roomMove.findMany({
      where: { warehouseId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, code: true, notes: true, createdAt: true,
        fromRoom: { select: { name: true } }, toRoom: { select: { name: true } }, createdBy: { select: { name: true } },
        items: { select: { stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } } },
      },
    }),
  ]);

  const history: MoveHistory[] = moves.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));

  return (
    <RoomMoveBoard
      standardRoomName={standardRoom.name}
      processingRoomName={processingRoom.name}
      standardStock={standardStock}
      processingStock={processingStock}
      history={history}
    />
  );
}
