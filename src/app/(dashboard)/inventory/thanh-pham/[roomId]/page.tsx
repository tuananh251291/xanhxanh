import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, PackageCheck, Eye, Globe, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ROOM_TYPE_LABELS } from "@/types";
import type { RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";

const PAGE_SIZE = 12;
const FINISHED_ROOM_TYPES: RoomType[] = ["PHONG_KHA_DUNG", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG"];

const ROOM_TYPE_ICONS: Partial<Record<RoomType, typeof Package>> = {
  PHONG_KHA_DUNG: PackageCheck,
  PHONG_THEO_DOI: Eye,
  PHONG_HAN_TUI: Package,
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

  // Không theo dõi theo mã lô — cộng gộp số lượng theo loại cây, tách riêng quy cách T01/T05.
  const aggMap = new Map<string, { code: string; name: string; t01: number; t05: number }>();
  for (const lot of lots) {
    const existing = aggMap.get(lot.plantTypeId) ?? { code: lot.plantType.code, name: lot.plantType.name, t01: 0, t05: 0 };
    if (lot.stageCode === "T01") existing.t01 += lot.quantity;
    else if (lot.stageCode === "T05") existing.t05 += lot.quantity;
    aggMap.set(lot.plantTypeId, existing);
  }
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
          <h1 className="text-2xl font-bold text-gray-900 flex flex-wrap items-center gap-2">
            <Icon className="w-6 h-6 text-green-600 shrink-0" /> <span className="break-words">{room.name}</span>
          </h1>
          <p className="text-gray-500 text-sm flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ROOM_TYPE_LABELS[room.type]}</Badge>
            · {aggregated.length} loại cây · {totalQuantity.toLocaleString("vi-VN")} cây
          </p>
        </div>
      </div>

      {aggregated.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Icon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Phòng này chưa có lô thành phẩm nào</p>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-green-700">
                      <th className="text-left px-3 py-2 text-xs font-medium text-white">Mã cây</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-white">Loại cây</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-white">T01</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-white">T05</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.code} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.t01.toLocaleString("vi-VN")}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.t05.toLocaleString("vi-VN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-sm text-gray-500">Trang {page}/{totalPages}</p>
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
