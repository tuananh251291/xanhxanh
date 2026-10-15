import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, PackageCheck, Eye, Globe, Layers, Search, Hourglass } from "lucide-react";
import Link from "next/link";
import { ROOM_TYPE_LABELS, FINISHED_STAGE_COLUMNS } from "@/types";
import type { RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import PlantTypeSummary from "./plant-type-summary";

const ROOM_TYPE_ICONS: Partial<Record<RoomType, typeof Package>> = {
  PHONG_DAT_TIEU_CHUAN: PackageCheck,
  PHONG_THEO_DOI: Eye,
  PHONG_HAN_TUI: Package,
  PHONG_CHO_XU_LY: Hourglass,
  PHONG_THI_TRUONG: Globe,
};

export default async function ThanhPhamInventoryPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/thanh-pham"))) redirect("/dashboard");

  const rooms = await prisma.room.findMany({
    where: {
      type: { in: ["PHONG_DAT_TIEU_CHUAN", "PHONG_CHO_XU_LY", "PHONG_THI_TRUONG"] },
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

  // Không theo dõi theo mã lô — cộng gộp số lượng theo quy cách (FINISHED_STAGE_COLUMNS) cho mỗi phòng. T10 chỉ phát
  // sinh trong Kho thành phẩm (đóng gói lại từ T01/T05), không sản xuất trực tiếp từ Phòng ra rễ.
  const roomStageTotals = (lots: { quantity: number; stageCode: string }[]) =>
    lots.reduce<Record<string, number>>((acc, l) => {
      acc[l.stageCode] = (acc[l.stageCode] ?? 0) + l.quantity;
      return acc;
    }, {});

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
          Tồn thực tế — số lượng vật lý thật trong kho. Tổng: {totalLots.length} lô ·{" "}
          {totalQuantity.toLocaleString("vi-VN")} cây
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
        const byStage = roomStageTotals(room.lots);
        return (
          <Card key={room.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex flex-wrap items-center gap-2">
                <Icon className="w-5 h-5 text-primary-strong shrink-0" />
                <span className="font-semibold text-foreground break-words">{room.name}</span>
                <Badge variant="secondary">{ROOM_TYPE_LABELS[room.type]}</Badge>
                {FINISHED_STAGE_COLUMNS.filter((c) => c === "T01" || c === "T05" || (byStage[c] ?? 0) > 0).map((c) => (
                  <Badge key={c} variant="outline" className="text-xs">{c}: {(byStage[c] ?? 0).toLocaleString("vi-VN")}</Badge>
                ))}
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
