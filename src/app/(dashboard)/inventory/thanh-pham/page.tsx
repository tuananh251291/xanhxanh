import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, PackageCheck, Eye, Globe, Layers, Search } from "lucide-react";
import Link from "next/link";
import { ROOM_TYPE_LABELS } from "@/types";
import type { RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import PlantTypeSummary from "./plant-type-summary";

const ROOM_TYPE_ICONS: Partial<Record<RoomType, typeof Package>> = {
  PHONG_KHA_DUNG: PackageCheck,
  PHONG_THEO_DOI: Eye,
  PHONG_HAN_TUI: Package,
  PHONG_THI_TRUONG: Globe,
};

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
      lots: {
        where: { status: "ACTIVE" },
        select: { quantity: true, stageCode: true, plantTypeId: true, plantType: { select: { code: true, name: true } } },
      },
    },
    orderBy: [{ warehouse: { name: "asc" } }, { type: "asc" }],
  });

  // Không theo dõi theo mã lô — cộng gộp số lượng theo quy cách T01/T05 cho mỗi phòng.
  const roomStageTotals = (lots: { quantity: number; stageCode: string }[]) =>
    lots.reduce(
      (acc, l) => {
        if (l.stageCode === "T01") acc.t01 += l.quantity;
        else if (l.stageCode === "T05") acc.t05 += l.quantity;
        return acc;
      },
      { t01: 0, t05: 0 }
    );

  const totalLots = rooms.flatMap((r) => r.lots);
  const totalQuantity = totalLots.reduce((s, l) => s + l.quantity, 0);

  const byType: Record<string, { code: string; name: string; quantity: number }> = {};
  for (const lot of totalLots) {
    const key = lot.plantTypeId;
    if (!byType[key]) byType[key] = { code: lot.plantType.code, name: `${lot.plantType.name} (${lot.plantType.code})`, quantity: 0 };
    byType[key].quantity += lot.quantity;
  }
  const byTypeEntries = Object.entries(byType)
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary-strong" /> Tồn kho thành phẩm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tổng: {totalLots.length} lô · {totalQuantity.toLocaleString("vi-VN")} cây
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Tồn kho theo loại cây</CardTitle></CardHeader>
        <CardContent>
          {byTypeEntries.length === 0 ? (
            <p className="text-text-muted text-sm">Kho trống</p>
          ) : (
            <PlantTypeSummary entries={byTypeEntries} />
          )}
        </CardContent>
      </Card>

      {rooms.map((room) => {
        const Icon = ROOM_TYPE_ICONS[room.type] ?? Package;
        const { t01, t05 } = roomStageTotals(room.lots);
        return (
          <Card key={room.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex flex-wrap items-center gap-2">
                <Icon className="w-5 h-5 text-primary-strong shrink-0" />
                <span className="font-semibold text-foreground break-words">{room.name}</span>
                <Badge variant="secondary">{ROOM_TYPE_LABELS[room.type]}</Badge>
                <Badge variant="outline" className="text-xs">T01: {t01.toLocaleString("vi-VN")}</Badge>
                <Badge variant="outline" className="text-xs">T05: {t05.toLocaleString("vi-VN")}</Badge>
              </div>
              <Link href={`/inventory/thanh-pham/${room.id}`}>
                <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                  <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                </Button>
              </Link>
            </CardContent>
          </Card>
        );
      })}

      {rooms.length === 0 && (
        <Card><CardContent className="py-12 text-center text-text-muted flex flex-col items-center gap-2">
          <Layers className="w-8 h-8 text-text-muted" />
          Chưa có phòng thành phẩm nào
        </CardContent></Card>
      )}
    </div>
  );
}
