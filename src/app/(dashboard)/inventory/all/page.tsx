import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Warehouse, Moon, Sun, Sprout, Package, PackageCheck, Eye, Globe, AlertTriangle } from "lucide-react";
import { ROOM_TYPE_LABELS, ROOM_TYPE_COLORS } from "@/types";
import type { RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import { isNearExpiry } from "@/lib/report-utils";

const ROOM_TYPE_ICONS: Record<RoomType, typeof Sun> = {
  PHONG_MAU_ME: Sun,
  PHONG_RA_RE: Sprout,
  PHONG_TOI: Moon,
  PHONG_KHA_DUNG: PackageCheck,
  PHONG_THEO_DOI: Eye,
  PHONG_HAN_TUI: Package,
  PHONG_THI_TRUONG: Globe,
};

const ROOM_TYPES_ORDER: RoomType[] = [
  "PHONG_MAU_ME",
  "PHONG_RA_RE",
  "PHONG_TOI",
  "PHONG_KHA_DUNG",
  "PHONG_THEO_DOI",
  "PHONG_HAN_TUI",
  "PHONG_THI_TRUONG",
];

export default async function AllInventoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/all"))) redirect("/dashboard");

  const lotSelect = {
    id: true,
    stage: true,
    quantity: true,
    plantTypeId: true,
    expectedMoveAt: true,
    plantType: { select: { name: true, code: true } },
  } as const;

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    include: {
      rooms: {
        where: { isActive: true },
        include: {
          shelves: {
            where: { isActive: true },
            include: { lots: { where: { status: "ACTIVE" }, select: lotSelect } },
          },
          // Kho thành phẩm không quản lý theo giàn kệ — lô gắn thẳng vào phòng.
          lots: { where: { status: "ACTIVE" }, select: lotSelect },
        },
      },
      shelves: {
        where: { isActive: true, roomId: null },
        include: { lots: { where: { status: "ACTIVE" }, select: lotSelect } },
      },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const rooms = warehouses.flatMap((w) =>
    w.rooms.map((r) => ({ ...r, warehouseName: w.name }))
  );

  const groupedByType = rooms.reduce<Record<string, typeof rooms>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const roomAllLots = (r: (typeof rooms)[number]) => [...r.shelves.flatMap((s) => s.lots), ...r.lots];
  const directShelfLots = warehouses.flatMap((w) => w.shelves.flatMap((s) => s.lots));
  const roomLots = rooms.flatMap(roomAllLots);
  const allLots = [...roomLots, ...directShelfLots];
  const totalMother = allLots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
  const totalFinished = allLots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);

  const byType = allLots.reduce<Record<string, { name: string; mother: number; finished: number }>>((acc, lot) => {
    const key = lot.plantTypeId;
    if (!acc[key]) acc[key] = { name: `${lot.plantType.name} (${lot.plantType.code})`, mother: 0, finished: 0 };
    if (lot.stage === "MAU_ME") acc[key].mother += lot.quantity;
    else acc[key].finished += lot.quantity;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Warehouse className="w-6 h-6 text-orange-500" /> Tồn kho tổng hợp
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tất cả kho · {allLots.length} lô · MM: {totalMother.toLocaleString("vi-VN")} · TP: {totalFinished.toLocaleString("vi-VN")}
        </p>
      </div>

      {/* Summary cards theo loại phòng */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ROOM_TYPES_ORDER.map((type) => {
          const rs = groupedByType[type] ?? [];
          if (rs.length === 0) return null;
          const lots = rs.flatMap(roomAllLots);
          const mother = lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
          const finished = lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);
          const nearExpiryCount = lots.filter((l) => isNearExpiry(l.expectedMoveAt)).length;
          const Icon = ROOM_TYPE_ICONS[type];
          return (
            <Card key={type} className="border">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-5 h-5" />
                  <span className="font-semibold">{ROOM_TYPE_LABELS[type]}</span>
                  <Badge className={ROOM_TYPE_COLORS[type]}>{rs.length} phòng</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {mother > 0 && <p>Mẫu mẹ: <strong>{mother.toLocaleString("vi-VN")}</strong></p>}
                  {finished > 0 && <p>Thành phẩm: <strong>{finished.toLocaleString("vi-VN")}</strong></p>}
                  {lots.length === 0 && <p className="text-gray-400">Trống</p>}
                  {nearExpiryCount > 0 && (
                    <p className="flex items-center gap-1 text-orange-600 font-medium pt-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {nearExpiryCount} lô sắp/quá hạn
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {directShelfLots.length > 0 && (
          <Card className="border">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5" />
                <span className="font-semibold">Kệ gắn thẳng kho (không qua phòng)</span>
              </div>
              <p className="text-sm">{directShelfLots.length} lô</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* By plant type */}
      {Object.keys(byType).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Theo loại cây</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700">
                    <th className="text-left py-2 font-medium text-white">Loại cây</th>
                    <th className="text-right py-2 font-medium text-white">Mẫu mẹ</th>
                    <th className="text-right py-2 font-medium text-white">Thành phẩm</th>
                    <th className="text-right py-2 font-medium text-white">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(byType).map((entry) => (
                    <tr key={entry.name} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                      <td className="py-2 font-medium">{entry.name}</td>
                      <td className="py-2 text-right text-purple-700">{entry.mother > 0 ? entry.mother.toLocaleString("vi-VN") : "—"}</td>
                      <td className="py-2 text-right text-green-700">{entry.finished > 0 ? entry.finished.toLocaleString("vi-VN") : "—"}</td>
                      <td className="py-2 text-right font-semibold">{(entry.mother + entry.finished).toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per phòng detail */}
      {ROOM_TYPES_ORDER.map((type) => {
        const rs = groupedByType[type];
        if (!rs?.length) return null;
        return (
          <div key={type} className="space-y-3">
            <h2 className="text-base font-semibold text-gray-700">{ROOM_TYPE_LABELS[type]}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rs.map((r) => {
                const lots = roomAllLots(r);
                const mother = lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
                const finished = lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);
                return (
                  <Card key={r.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{r.warehouseName} — {r.name}</p>
                          <p className="text-xs text-gray-400">
                            {r.shelves.length > 0 ? `${r.shelves.length} kệ · ` : ""}{lots.length} lô
                          </p>
                        </div>
                        <div className="text-right text-sm space-y-0.5">
                          {mother > 0 && <p className="text-purple-700">MM: {mother.toLocaleString("vi-VN")}</p>}
                          {finished > 0 && <p className="text-green-700">TP: {finished.toLocaleString("vi-VN")}</p>}
                          {lots.length === 0 && <p className="text-gray-400">Trống</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
