import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Layers, Search } from "lucide-react";
import { ROOM_TYPE_LABELS, ROOM_TYPE_COLORS, isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import type { RoomType } from "@prisma/client";
import AddShelvesDialog from "../../add-shelves-dialog";
import ImportExportShelvesDialog from "./import-export-shelves-dialog";
import ShelfListView from "./shelf-list-view";

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/warehouses"))) redirect("/dashboard");

  const { roomId } = await params;
  const sp = await searchParams;
  const search = sp.q?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, code: true, name: true, type: true, warehouseId: true, warehouse: { select: { id: true, code: true, name: true } } },
  });
  if (!room || (room.type !== "PHONG_MAU_ME" && room.type !== "PHONG_RA_RE")) notFound();

  const canManageStaffAndPlant = session?.user?.role === "SUPER_ADMIN";
  const canMoveRoom = isAdminRole(session?.user?.role);

  // Phòng ra rễ không tách nhóm — giữ nguyên danh sách phẳng có phân trang như trước.
  if (room.type === "PHONG_RA_RE") {
    return (
      <ShelfListView
        room={room as typeof room & { type: "PHONG_RA_RE" }}
        search={search}
        page={page}
        backHref="/warehouses"
        backLabel="Về Kho & Kệ"
        heading={room.name}
        basePath={`/warehouses/rooms/${room.id}`}
        actions={canManageStaffAndPlant && <ImportExportShelvesDialog roomId={room.id} roomCode={room.code} />}
      />
    );
  }

  // Phòng mẫu mẹ — chỉ hiện 2 thẻ tổng số lượng THẬT theo toàn phòng (không tính theo 8 dòng của 1
  // trang như bảng gộp cũ), bấm "Xem chi tiết" mới vào danh sách phân trang riêng của từng nhóm — xem
  // rooms/[roomId]/da-chia và rooms/[roomId]/chung.
  const [daChiaCount, chungCount, caymoStaff, plantTypes] = await Promise.all([
    prisma.shelf.count({
      where: { roomId: room.id, isActive: true, OR: [{ plantTypeId: { not: null } }, { assignedStaffId: { not: null } }] },
    }),
    prisma.shelf.count({
      where: { roomId: room.id, isActive: true, plantTypeId: null, assignedStaffId: null },
    }),
    prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/warehouses">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary-strong" /> {room.name}
            <Badge className={ROOM_TYPE_COLORS[room.type as RoomType]}>{ROOM_TYPE_LABELS[room.type as RoomType]}</Badge>
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {room.warehouse.name} ({room.warehouse.code}) — {room.code} · {daChiaCount + chungCount} kệ
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageStaffAndPlant && <ImportExportShelvesDialog roomId={room.id} roomCode={room.code} />}
          {canMoveRoom && (
            <AddShelvesDialog
              roomId={room.id}
              roomCode={room.code}
              roomType={room.type as "PHONG_MAU_ME"}
              caymoStaff={caymoStaff}
              plantTypes={plantTypes}
              canAssignStaff={canManageStaffAndPlant}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="py-6 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-primary-strong">Kho mẫu mẹ đã chia</p>
              <p className="text-sm text-text-secondary mt-1">{daChiaCount} kệ — đã gán mã cây và/hoặc nhân viên phụ trách</p>
            </div>
            <Link href={`/warehouses/rooms/${room.id}/da-chia`}>
              <Button size="sm" className="bg-primary hover:bg-primary-hover shrink-0">
                <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-primary-strong">Kho mẫu mẹ chung</p>
              <p className="text-sm text-text-secondary mt-1">{chungCount} kệ — chưa gán mã cây/nhân viên</p>
            </div>
            <Link href={`/warehouses/rooms/${room.id}/chung`}>
              <Button size="sm" className="bg-primary hover:bg-primary-hover shrink-0">
                <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
