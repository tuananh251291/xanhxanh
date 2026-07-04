import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, PackageCheck, Eye, Globe, Layers } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { vi } from "date-fns/locale";
import { ROOM_TYPE_LABELS } from "@/types";
import type { RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";

const ROOM_TYPE_ICONS: Partial<Record<RoomType, typeof Package>> = {
  PHONG_KHA_DUNG: PackageCheck,
  PHONG_THEO_DOI: Eye,
  PHONG_HAN_TUI: Package,
  PHONG_THI_TRUONG: Globe,
};

function expiryClass(expectedMoveAt: Date | null): string {
  if (!expectedMoveAt) return "text-gray-400";
  const daysLeft = differenceInCalendarDays(expectedMoveAt, new Date());
  if (daysLeft < 0) return "text-red-600 font-semibold";
  if (daysLeft <= 3) return "text-orange-600 font-semibold";
  return "text-gray-400";
}

export default async function ThanhPhamInventoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/thanh-pham"))) redirect("/dashboard");

  const rooms = await prisma.room.findMany({
    where: {
      type: { in: ["PHONG_KHA_DUNG", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG"] },
      isActive: true,
    },
    include: {
      warehouse: { select: { name: true } },
      shelves: {
        where: { isActive: true },
        include: {
          lots: {
            where: { status: "ACTIVE" },
            include: { plantType: { select: { code: true, name: true } } },
            orderBy: { enteredAt: "asc" },
          },
        },
        orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
      },
    },
    orderBy: [{ warehouse: { name: "asc" } }, { type: "asc" }],
  });

  const totalLots = rooms.flatMap((r) => r.shelves.flatMap((s) => s.lots));
  const totalQuantity = totalLots.reduce((s, l) => s + l.quantity, 0);

  const byType: Record<string, { name: string; quantity: number }> = {};
  for (const lot of totalLots) {
    const key = lot.plantTypeId;
    if (!byType[key]) byType[key] = { name: `${lot.plantType.name} (${lot.plantType.code})`, quantity: 0 };
    byType[key].quantity += lot.quantity;
  }
  const byTypeEntries = Object.values(byType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6 text-green-600" /> Tồn kho thành phẩm
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tổng: {totalLots.length} lô · {totalQuantity.toLocaleString("vi-VN")} cây
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Tổng hợp theo loại cây</CardTitle></CardHeader>
        <CardContent>
          {byTypeEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">Kho trống</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {byTypeEntries.map((e) => (
                <div key={e.name} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                  <span className="font-medium text-sm">{e.name}</span>
                  <Badge className="bg-green-100 text-green-700">{e.quantity.toLocaleString("vi-VN")}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {rooms.map((room) => {
        const Icon = ROOM_TYPE_ICONS[room.type] ?? Package;
        const roomLots = room.shelves.flatMap((s) => s.lots);
        return (
          <div key={room.id} className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Icon className="w-5 h-5 text-green-600" /> {room.warehouse.name} — {room.name}
              <Badge variant="secondary" className="ml-1">{ROOM_TYPE_LABELS[room.type]}</Badge>
              <span className="text-sm text-gray-400 font-normal">· {roomLots.length} lô</span>
            </h2>
            {room.shelves.length === 0 ? (
              <p className="text-sm text-gray-400 pl-2">Chưa có kệ</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {room.shelves.map((shelf) => {
                  const shelfQuantity = shelf.lots.reduce((s, l) => s + l.quantity, 0);
                  return (
                    <Card key={shelf.id} className={shelf.lots.length === 0 ? "opacity-50" : ""}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-mono">{shelf.code}</CardTitle>
                          <span className="text-xs text-gray-500">{shelf.name}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {shelf.lots.length === 0 ? (
                          <p className="text-xs text-gray-400">Trống</p>
                        ) : (
                          <div className="space-y-1">
                            <Badge className="bg-green-100 text-green-700 text-xs">{shelfQuantity.toLocaleString("vi-VN")} cây</Badge>
                            <div className="space-y-0.5 mt-1">
                              {shelf.lots.slice(0, 5).map((lot) => {
                                const daysLeft = lot.expectedMoveAt
                                  ? differenceInCalendarDays(lot.expectedMoveAt, new Date())
                                  : null;
                                return (
                                  <div key={lot.id} className="flex items-center justify-between text-xs text-gray-600">
                                    <span className="font-mono">{lot.code}</span>
                                    <span>{lot.quantity.toLocaleString("vi-VN")}</span>
                                    <span className={expiryClass(lot.expectedMoveAt)}>
                                      {daysLeft === null
                                        ? format(lot.enteredAt, "dd/MM", { locale: vi })
                                        : daysLeft < 0
                                          ? `Quá hạn ${Math.abs(daysLeft)}d`
                                          : daysLeft <= 3
                                            ? `Còn ${daysLeft}d`
                                            : format(lot.enteredAt, "dd/MM", { locale: vi })}
                                    </span>
                                  </div>
                                );
                              })}
                              {shelf.lots.length > 5 && (
                                <p className="text-xs text-gray-400">+{shelf.lots.length - 5} lô khác</p>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {rooms.length === 0 && (
        <Card><CardContent className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
          <Layers className="w-8 h-8 text-gray-300" />
          Chưa có phòng thành phẩm nào
        </CardContent></Card>
      )}
    </div>
  );
}
