import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, PackageCheck, Globe, Layers, Search } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import PlantTypeSummary from "../thanh-pham/plant-type-summary";

const LOT_SELECT = {
  quantity: true,
  stageCode: true,
  plantTypeId: true,
  plantType: { select: { code: true, name: true } },
  orderItems: {
    where: {
      order: { status: { in: ["HELD" as const, "CONFIRMED" as const] } },
      OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" as const } } }],
    },
    select: { quantity: true },
  },
};

// Tồn đạt tiêu chuẩn = tồn thực − tổng số lượng đã bị giữ bởi đơn HELD (CLAUDE.md "Quy tắc tồn kho") — cùng
// công thức getAvailableQuantity (src/lib/inventory.ts) nhưng áp trực tiếp lên lô đã fetch sẵn, tránh
// query lại từng lô.
const netQuantity = (lot: { quantity: number; orderItems: { quantity: number }[] }) =>
  lot.quantity - lot.orderItems.reduce((s, i) => s + i.quantity, 0);

export default async function AvailableInventoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/dat-tieu-chuan"))) redirect("/dashboard");

  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
  const userId = session?.user?.id ?? "";

  const [homeRoom, marketRooms] = await Promise.all([
    workplaceWarehouseId
      ? prisma.room.findFirst({
          where: { warehouseId: workplaceWarehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true },
          include: {
            lots: { where: { status: "ACTIVE" }, select: LOT_SELECT },
            warehouse: { select: { code: true, name: true } },
          },
        })
      : null,
    prisma.room.findMany({
      where: { type: "PHONG_THI_TRUONG", isActive: true, roomAccess: { some: { userId } } },
      include: {
        lots: { where: { status: "ACTIVE" }, select: LOT_SELECT },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  const rooms = [...(homeRoom ? [homeRoom] : []), ...marketRooms];

  // T10 chỉ phát sinh trong Kho thành phẩm (đóng gói lại từ T01/T05, không sản xuất trực tiếp từ Phòng
  // ra rễ) — vẫn hiển thị ở đây vì trang này đọc thẳng lô trong Phòng đạt tiêu chuẩn/Phòng thị trường.
  const roomStageTotals = (lots: { stageCode: string; quantity: number; orderItems: { quantity: number }[] }[]) =>
    lots.reduce(
      (acc, l) => {
        const available = netQuantity(l);
        if (l.stageCode === "T01") acc.t01 += available;
        else if (l.stageCode === "T05") acc.t05 += available;
        else if (l.stageCode === "T10") acc.t10 += available;
        return acc;
      },
      { t01: 0, t05: 0, t10: 0 }
    );

  const totalLots = rooms.flatMap((r) => r.lots).filter((l) => netQuantity(l) > 0);
  const totalQuantity = totalLots.reduce((s, l) => s + netQuantity(l), 0);

  const byType: Record<string, { code: string; name: string; quantity: number }> = {};
  for (const lot of totalLots) {
    const key = lot.plantTypeId;
    if (!byType[key]) byType[key] = { code: lot.plantType.code, name: `${lot.plantType.name} (${lot.plantType.code})`, quantity: 0 };
    byType[key].quantity += netQuantity(lot);
  }
  const byTypeEntries = Object.entries(byType)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary-strong" /> Tồn đạt tiêu chuẩn
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tổng: {totalLots.length} lô · {totalQuantity.toLocaleString("vi-VN")} cây
        </p>
      </div>

      {rooms.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted flex flex-col items-center gap-2">
          <Layers className="w-8 h-8 text-text-muted" />
          Chưa được cấp quyền xem kho nào — liên hệ Admin để được gán Kho thành phẩm làm việc hoặc cấp quyền xem Phòng thị trường.
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Tồn kho theo loại cây</CardTitle></CardHeader>
            <CardContent>
              {byTypeEntries.length === 0 ? (
                <p className="text-text-muted text-sm">Chưa có tồn kho</p>
              ) : (
                <PlantTypeSummary entries={byTypeEntries} />
              )}
            </CardContent>
          </Card>

          {rooms.map((room) => {
            const isHome = room.id === homeRoom?.id;
            const Icon = isHome ? PackageCheck : Globe;
            const { t01, t05, t10 } = roomStageTotals(room.lots);
            return (
              <Card key={room.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <Icon className="w-5 h-5 text-primary-strong shrink-0" />
                    <span className="font-semibold text-foreground break-words">{room.name}</span>
                    <Badge variant="secondary">{room.warehouse.name} ({room.warehouse.code})</Badge>
                    {isHome && <Badge className="bg-primary-light text-primary-strong">Kho của bạn</Badge>}
                    <Badge variant="outline" className="text-xs">T01: {t01.toLocaleString("vi-VN")}</Badge>
                    <Badge variant="outline" className="text-xs">T05: {t05.toLocaleString("vi-VN")}</Badge>
                    {t10 > 0 && <Badge variant="outline" className="text-xs">T10: {t10.toLocaleString("vi-VN")}</Badge>}
                  </div>
                  <Link href={`/inventory/dat-tieu-chuan/${room.id}`}>
                    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                      <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
