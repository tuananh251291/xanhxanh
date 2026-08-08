import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { Prisma } from "@prisma/client";
import ShelfTable from "../../shelf-table";
import RotationStartWeekForm from "./rotation-start-week-form";

const PAGE_SIZE = 8;

// Danh sách giàn kệ có phân trang, dùng chung cho 3 nơi: Phòng ra rễ (không tách nhóm), và 2 trang con
// "Kho mẫu mẹ đã chia"/"Kho mẫu mẹ chung" của Phòng mẫu mẹ (xem page.tsx — trang Phòng mẫu mẹ giờ chỉ
// hiện 2 thẻ tổng số lượng đúng theo TOÀN PHÒNG, không còn đếm nhầm theo 8 dòng của 1 trang như trước).
export default async function ShelfListView({
  room,
  search,
  page,
  extraWhere,
  section,
  backHref,
  backLabel,
  heading,
  basePath,
  actions,
}: {
  room: { id: string; code: string; name: string; type: "PHONG_MAU_ME" | "PHONG_RA_RE"; warehouseId: string; warehouse: { id: string; code: string; name: string } };
  search: string;
  page: number;
  extraWhere?: Prisma.ShelfWhereInput;
  section?: "DA_CHIA" | "CHUNG";
  backHref: string;
  backLabel: string;
  heading: string;
  basePath: string;
  actions?: React.ReactNode;
}) {
  const session = await auth();
  const canManageStaffAndPlant = session?.user?.role === "SUPER_ADMIN";
  const canMoveRoom = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  // Gộp qua AND: [...] thay vì spread trực tiếp — extraWhere của trang "đã chia" cũng có khóa OR
  // (điều kiện phân loại), spread thẳng ...extraWhere rồi ...{OR:[...]} (điều kiện tìm kiếm) sẽ khiến
  // OR sau GHI ĐÈ mất OR trước (cùng khóa) — kết quả tìm kiếm sẽ mất hẳn điều kiện phân loại, hiện lẫn
  // cả kệ "chung" khi search khớp mã/tên kệ. AND: [...] tránh hoàn toàn việc trùng khóa dù extraWhere
  // của trang khác (VD "chung") không có OR.
  const shelfWhere: Prisma.ShelfWhereInput = {
    roomId: room.id,
    isActive: true,
    AND: [
      extraWhere ?? {},
      search
        ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { block: { contains: search, mode: "insensitive" } }] }
        : {},
    ],
  };

  const [filteredTotal, shelves, caymoStaff, moveableRooms, rotationGroupOptions, plantTypeOptions] = await Promise.all([
    prisma.shelf.count({ where: shelfWhere }),
    prisma.shelf.findMany({
      where: shelfWhere,
      include: {
        plantType: { select: { id: true, code: true, name: true } },
        assignedStaff: { select: { id: true, code: true, name: true } },
        rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
        lots: {
          // quantity > 0 — xem giải thích ở src/app/(dashboard)/warehouses/page.tsx cùng shelfInclude.
          where: { status: "ACTIVE", quantity: { gt: 0 } },
          select: { id: true, code: true, quantity: true, stageCode: true, plantType: { select: { code: true, name: true } } },
        },
      },
      orderBy: [{ block: "asc" }, { rowNumber: "asc" }, { colNumber: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.room.findMany({
      where: { warehouseId: room.warehouseId, type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] }, isActive: true },
      select: { id: true, code: true, name: true, type: true },
    }),
    // Nhóm tuần đúng loại theo room.type (RA_RE cho Phòng ra rễ, MAU_ME cho Phòng mẫu mẹ) để gán trực
    // tiếp tại bảng kệ (xem shelf-table.tsx) — ràng buộc nghiệp vụ (VD Phòng mẫu mẹ yêu cầu đã gán mã
    // cây, khe không vượt "Thời gian đợi cấy chuyển") vẫn được kiểm tra ở server lúc lưu.
    prisma.shelfGroup.findMany({
      where: { rotationKind: room.type === "PHONG_RA_RE" ? "RA_RE" : "MAU_ME" },
      select: { id: true, name: true },
      orderBy: { rotationOrder: "asc" },
    }),
    // Gán mã cây trực tiếp tại bảng kệ (Kho mẫu mẹ đã chia, xem shelf-table.tsx) — chỉ có ý nghĩa với
    // Phòng mẫu mẹ, nhưng cứ fetch chung ở đây cho gọn (component tự ẩn cột khi không phải Phòng mẫu mẹ).
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("page", String(p));
    return `${basePath}?${qs.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" title={backLabel}><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary-strong" /> {heading}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {room.warehouse.name} ({room.warehouse.code}) — {room.code} · {filteredTotal} kệ
          </p>
        </div>
        {actions}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-6">
            <form className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tìm theo giàn kệ</Label>
                <Input type="text" name="q" defaultValue={search} placeholder="VD: H01C01 hoặc Kệ H01" className="w-64" />
              </div>
              <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
                <Search className="w-4 h-4 mr-1" /> Tìm kiếm
              </Button>
              {search && (
                <Link href={basePath}>
                  <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
                </Link>
              )}
            </form>
            {canManageStaffAndPlant && (
              <RotationStartWeekForm kind={room.type === "PHONG_RA_RE" ? "RA_RE" : "MAU_ME"} />
            )}
          </div>
        </CardContent>
      </Card>

      {shelves.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Layers className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>{search ? "Không tìm thấy giàn kệ phù hợp" : "Chưa có giàn kệ nào"}</p>
        </CardContent></Card>
      ) : (
        <ShelfTable
          shelves={shelves}
          currentRoomId={room.id}
          currentRoomType={room.type}
          staffOptions={caymoStaff}
          plantTypeOptions={plantTypeOptions}
          rotationGroupOptions={rotationGroupOptions}
          canManageStaffAndPlant={canManageStaffAndPlant}
          canMoveRoom={canMoveRoom}
          moveableRooms={moveableRooms.filter((r) => r.id !== room.id)}
          section={section}
        />
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-sm text-text-secondary">Trang {page}/{totalPages} — {filteredTotal} kệ{search ? " (đã lọc)" : ""}</p>
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
    </div>
  );
}
