import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, PackageCheck, Eye, Globe, ArrowLeft, ChevronLeft, ChevronRight, Hourglass } from "lucide-react";
import Link from "next/link";
import { ROOM_TYPE_LABELS, FINISHED_STAGE_COLUMNS } from "@/types";
import type { RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";

const PAGE_SIZE = 12;
const FINISHED_ROOM_TYPES: RoomType[] = ["PHONG_DAT_TIEU_CHUAN", "PHONG_CHO_XU_LY", "PHONG_THI_TRUONG"];

const ROOM_TYPE_ICONS: Partial<Record<RoomType, typeof Package>> = {
  PHONG_DAT_TIEU_CHUAN: PackageCheck,
  PHONG_THEO_DOI: Eye,
  PHONG_HAN_TUI: Package,
  PHONG_CHO_XU_LY: Hourglass,
  PHONG_THI_TRUONG: Globe,
};

export default async function ThanhPhamRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/thanh-pham"))) redirect("/dashboard");

  const { roomId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, name: true, type: true },
  });
  if (!room || !FINISHED_ROOM_TYPES.includes(room.type)) notFound();

  const lots = await prisma.lot.findMany({
    where: { roomId, status: "ACTIVE" },
    select: { quantity: true, stageCode: true, plantTypeId: true, plantType: { select: { code: true, name: true } } },
  });

  // Không theo dõi theo mã lô — cộng gộp số lượng theo loại cây, tách riêng quy cách T01/T05/T10.
  const aggMap = new Map<string, { code: string; name: string; byStage: Record<string, number> }>();
  for (const lot of lots) {
    const existing = aggMap.get(lot.plantTypeId) ?? { code: lot.plantType.code, name: lot.plantType.name, byStage: {} };
    existing.byStage[lot.stageCode] = (existing.byStage[lot.stageCode] ?? 0) + lot.quantity;
    aggMap.set(lot.plantTypeId, existing);
  }
  // T01/T05/T10 luôn hiện; T06/T20/T25 (chỉ có từ nhập hàng) chỉ hiện cột khi phòng có tồn quy cách đó.
  const stageColumns = FINISHED_STAGE_COLUMNS.filter(
    (c) => c === "T01" || c === "T05" || c === "T10" || [...aggMap.values()].some((r) => (r.byStage[c] ?? 0) !== 0)
  );
  const aggregated = Array.from(aggMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  const totalQuantity = lots.reduce((s, l) => s + l.quantity, 0);

  const totalPages = Math.max(1, Math.ceil(aggregated.length / PAGE_SIZE));
  const pageRows = aggregated.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);

  const Icon = ROOM_TYPE_ICONS[room.type] ?? Package;
  const pageHref = (p: number) => `/inventory/thanh-pham/${room.id}?page=${p}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/inventory/thanh-pham">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-foreground flex flex-wrap items-center gap-2">
            <Icon className="w-6 h-6 text-primary-strong shrink-0" /> <span className="break-words">{room.name}</span>
          </h1>
          <p className="text-text-secondary text-sm flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ROOM_TYPE_LABELS[room.type]}</Badge>
            · {aggregated.length} loại cây · {totalQuantity.toLocaleString("vi-VN")} cây
          </p>
        </div>
      </div>

      {aggregated.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Icon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Phòng này chưa có lô thành phẩm nào</p>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Mã cây</th>
                      <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Loại cây</th>
                      {stageColumns.map((c) => (
                        <th key={c} className="text-right px-3 py-2 text-sm text-primary-strong font-bold">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.code} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        {stageColumns.map((c) => (
                          <td key={c} className="px-3 py-2 text-right font-medium">{(row.byStage[c] ?? 0).toLocaleString("vi-VN")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-sm text-text-secondary">Trang {page}/{totalPages}</p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)}>
                    <Button variant="outline" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Trước</Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled><ChevronLeft className="w-4 h-4 mr-1" /> Trước</Button>
                )}
                {page < totalPages ? (
                  <Link href={pageHref(page + 1)}>
                    <Button variant="outline" size="sm">Sau <ChevronRight className="w-4 h-4 ml-1" /></Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled>Sau <ChevronRight className="w-4 h-4 ml-1" /></Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
