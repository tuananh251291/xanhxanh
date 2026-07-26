import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageCheck, Globe, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";

const PAGE_SIZE = 12;

export default async function AvailableInventoryRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/dat-tieu-chuan"))) redirect("/dashboard");

  const { roomId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
  const userId = session?.user?.id ?? "";

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, name: true, type: true, warehouseId: true },
  });
  if (!room) notFound();

  // Chỉ xem được: (a) đúng Phòng đạt tiêu chuẩn của kho thành phẩm mình phụ trách, hoặc (b) Phòng thị trường
  // đã được Admin cấp quyền riêng (RoomAccess) — chặn Sale gõ tay roomId của kho không được cấp quyền.
  const isHome = room.type === "PHONG_DAT_TIEU_CHUAN" && room.warehouseId === workplaceWarehouseId;
  const hasMarketAccess =
    room.type === "PHONG_THI_TRUONG" &&
    (await prisma.roomAccess.findUnique({ where: { userId_roomId: { userId, roomId: room.id } } })) !== null;
  if (!isHome && !hasMarketAccess) notFound();

  const lots = await prisma.lot.findMany({
    where: { roomId, status: "ACTIVE" },
    select: {
      quantity: true,
      stageCode: true,
      plantTypeId: true,
      plantType: { select: { code: true, name: true } },
      orderItems: {
        where: {
          order: { status: { in: ["HELD", "CONFIRMED"] } },
          OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
        },
        select: { quantity: true },
      },
    },
  });

  // Tồn đạt tiêu chuẩn = tồn thực − tổng số lượng đã bị giữ bởi đơn HELD (CLAUDE.md "Quy tắc tồn kho").
  const netQuantity = (lot: { quantity: number; orderItems: { quantity: number }[] }) =>
    lot.quantity - lot.orderItems.reduce((s, i) => s + i.quantity, 0);

  const aggMap = new Map<string, { code: string; name: string; t01: number; t05: number; t10: number }>();
  for (const lot of lots) {
    const existing = aggMap.get(lot.plantTypeId) ?? { code: lot.plantType.code, name: lot.plantType.name, t01: 0, t05: 0, t10: 0 };
    const available = netQuantity(lot);
    if (lot.stageCode === "T01") existing.t01 += available;
    else if (lot.stageCode === "T05") existing.t05 += available;
    else if (lot.stageCode === "T10") existing.t10 += available;
    aggMap.set(lot.plantTypeId, existing);
  }
  const aggregated = Array.from(aggMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  const totalQuantity = lots.reduce((s, l) => s + netQuantity(l), 0);

  const totalPages = Math.max(1, Math.ceil(aggregated.length / PAGE_SIZE));
  const pageRows = aggregated.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);

  const Icon = isHome ? PackageCheck : Globe;
  const pageHref = (p: number) => `/inventory/dat-tieu-chuan/${room.id}?page=${p}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/inventory/dat-tieu-chuan">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-foreground flex flex-wrap items-center gap-2">
            <Icon className="w-6 h-6 text-primary-strong shrink-0" /> <span className="break-words">{room.name}</span>
          </h1>
          <p className="text-text-secondary text-sm flex flex-wrap items-center gap-2">
            {aggregated.length} loại cây · {totalQuantity.toLocaleString("vi-VN")} cây
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
                      <th className="text-right px-3 py-2 text-sm text-primary-strong font-bold">T01</th>
                      <th className="text-right px-3 py-2 text-sm text-primary-strong font-bold">T05</th>
                      <th className="text-right px-3 py-2 text-sm text-primary-strong font-bold">T10</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.code} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.t01.toLocaleString("vi-VN")}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.t05.toLocaleString("vi-VN")}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.t10.toLocaleString("vi-VN")}</td>
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
