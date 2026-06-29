import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, QrCode, Package } from "lucide-react";
import { WAREHOUSE_TYPE_LABELS } from "@/types";
import type { WarehouseType } from "@prisma/client";
import CreateWarehouseDialog from "./create-warehouse-dialog";
import ShelfList from "./shelf-list";

export default async function WarehousesPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");

  const warehouses = await prisma.warehouse.findMany({
    include: {
      shelves: {
        where: { isActive: true },
        include: {
          _count: { select: { lots: { where: { status: "ACTIVE" } } } },
        },
        orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
      },
    },
    orderBy: { type: "asc" },
  });

  const typeColors: Record<WarehouseType, string> = {
    PHONG_TOI: "bg-gray-800 text-white",
    KHO_SANG: "bg-yellow-100 text-yellow-800",
    KHO_THANH_PHAM: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kho & Giàn kệ</h1>
          <p className="text-gray-500 text-sm mt-1">{warehouses.length} kho</p>
        </div>
        <CreateWarehouseDialog />
      </div>

      <div className="space-y-6">
        {warehouses.map((wh) => (
          <Card key={wh.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{wh.name}</CardTitle>
                  <Badge className={typeColors[wh.type as WarehouseType]}>
                    {WAREHOUSE_TYPE_LABELS[wh.type as WarehouseType]}
                  </Badge>
                  <span className="text-sm text-gray-500">({wh.code})</span>
                </div>
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Thêm kệ
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {wh.shelves.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Chưa có giàn kệ nào</p>
              ) : (
                <ShelfList shelves={wh.shelves} warehouseId={wh.id} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
