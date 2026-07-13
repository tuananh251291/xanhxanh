import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Warehouse as WarehouseIcon } from "lucide-react";
import Link from "next/link";
import { startOfDay, endOfDay } from "date-fns";
import { isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { summarizeMotherWeekGroups } from "@/lib/mother-week-group";
import CreateInstructionDialog from "../../create-instruction-dialog";

export default async function MotherDueWarehousePage({
  params,
  searchParams,
}: {
  params: Promise<{ warehouseId: string }>;
  searchParams: Promise<{ date?: string; shelf?: string; plantCode?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/instructions"))) redirect("/dashboard");
  if (!(isAdminRole(role) || role === "KY_THUAT")) redirect("/instructions");

  const { warehouseId } = await params;
  const sp = await searchParams;
  const dateFilter = sp.date?.trim() ?? "";
  const shelfFilter = sp.shelf?.trim() ?? "";
  const plantCodeFilter = sp.plantCode?.trim() ?? "";

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: { name: true },
  });
  if (!warehouse) notFound();

  const shelfWhere: Record<string, unknown> = {
    isActive: true,
    warehouseId,
    room: { type: "PHONG_MAU_ME" },
    rotationGroupId: { not: null },
  };
  if (shelfFilter) {
    shelfWhere.OR = [
      { code: { contains: shelfFilter, mode: "insensitive" } },
      { name: { contains: shelfFilter, mode: "insensitive" } },
    ];
  }
  if (plantCodeFilter) {
    shelfWhere.plantType = { code: { contains: plantCodeFilter, mode: "insensitive" } };
  }
  // Lô đã được dùng làm nguồn cho 1 chỉ định cấy (bất kể còn dư số lượng hay không) coi như đã xử lý
  // xong — không tính vào "đến hạn cấy chuyển" nữa, giống hệt cách /mother-ready lọc
  // (_count.instructionItems === 0). Thiếu điều kiện này khiến kệ vẫn hiện lại ở đây dù NV kỹ thuật đã
  // tạo chỉ định xong cho lô mẫu mẹ trên kệ đó.
  const lotWhere: Record<string, unknown> = { status: "ACTIVE", instructionItems: { none: {} } };
  if (dateFilter) {
    const d = new Date(dateFilter);
    if (!Number.isNaN(d.getTime())) {
      shelfWhere.lots = {
        some: { status: "ACTIVE", instructionItems: { none: {} }, expectedMoveAt: { gte: startOfDay(d), lte: endOfDay(d) } },
      };
    }
  }

  const shelves = await prisma.shelf.findMany({
    where: shelfWhere,
    select: {
      id: true,
      code: true,
      name: true,
      rowNumber: true,
      colNumber: true,
      block: true,
      warehouse: { select: { id: true, code: true, name: true } },
      rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
      plantType: { select: { code: true } },
      lots: { where: lotWhere, select: { quantity: true, expectedMoveAt: true } },
    },
  });

  const dueShelves = summarizeMotherWeekGroups(shelves)
    .filter((g) => g.isDue)
    .flatMap((g) => g.shelves);

  const hasFilters = !!(dateFilter || shelfFilter || plantCodeFilter);

  // Sắp theo block (chữ hàng + số hàng, VD "A01") rồi tới cột — rowNumber một mình không đủ để xếp
  // đúng thứ tự A, B, C... (2 hàng khác chữ cái có thể trùng rowNumber), xem src/lib/mother-week-group.ts.
  const sortedShelves = [...dueShelves].sort(
    (a, b) => (a.block ?? "").localeCompare(b.block ?? "") || (a.colNumber ?? 0) - (b.colNumber ?? 0)
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/instructions"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <WarehouseIcon className="w-5 h-5 text-primary-strong" />
          {warehouse.name} — kệ đến hạn cấy chuyển
        </h1>
        <p className="text-text-secondary text-sm mt-1">{dueShelves.length} kệ</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <form className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Ngày đến hạn</Label>
                <Input type="date" name="date" defaultValue={dateFilter} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Giàn kệ</Label>
                <Input type="text" name="shelf" defaultValue={shelfFilter} placeholder="VD: SXA-PS-R1C02" className="w-48" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mã cây</Label>
                <Input type="text" name="plantCode" defaultValue={plantCodeFilter} placeholder="VD: AL001" className="w-40" />
              </div>
              <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
                <Search className="w-4 h-4 mr-1" /> Tìm kiếm
              </Button>
              {hasFilters && (
                <Link href={`/instructions/mother-due/${warehouseId}`}>
                  <Button type="button" variant="outline" size="sm">Xóa lọc</Button>
                </Link>
              )}
            </form>
            <CreateInstructionDialog />
          </div>
        </CardContent>
      </Card>

      {dueShelves.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có kệ nào đến hạn cấy chuyển{hasFilters ? " khớp bộ lọc" : ""}</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="py-4 overflow-x-auto">
            {/* 4 cột cố định chiều rộng (không giãn hết bề ngang thẻ) — nút "Tạo chỉ định" luôn nằm ở
                mép phải mỗi cột (justify-between) nên các nút thẳng hàng nhau theo chiều dọc. */}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 13rem))" }}>
              {sortedShelves.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-1.5 bg-card border rounded-lg pl-2 pr-1 py-1"
                >
                  {/* Bỏ tiền tố mã kho/phòng (VD "SX-TA-PS-") cho gọn, chỉ giữ phần hàng+cột thật sự
                      phân biệt kệ trong khu — luôn là đoạn cuối cùng sau dấu "-" (xem cách sinh
                      shelf.code trong src/app/api/shelves/route.ts). */}
                  <span className="text-xs font-mono truncate">
                    {s.code.split("-").pop() ?? s.code}
                    {s.plantTypeCode ? ` · ${s.plantTypeCode}` : ""}
                  </span>
                  <CreateInstructionDialog
                    initialShelfId={s.id}
                    triggerContent="Tạo chỉ định"
                    triggerClassName="h-6 px-2 text-xs bg-primary hover:bg-primary-hover shrink-0"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
