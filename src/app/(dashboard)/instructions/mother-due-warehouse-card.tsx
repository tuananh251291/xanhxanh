import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Search, Warehouse as WarehouseIcon } from "lucide-react";
import Link from "next/link";
import type { MotherDueWarehouseSummary } from "@/lib/mother-week-group";

export default function MotherDueWarehouseCard({ warehouse }: { warehouse: MotherDueWarehouseSummary }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-primary-strong shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-bold text-primary-strong flex items-center gap-1.5">
                <WarehouseIcon className="w-4 h-4" />
                {warehouse.warehouseName} - Danh sách kệ đã đến hạn cấy chuyển — {warehouse.shelves.length} kệ cần đưa ra chỉ định cấy
              </p>
              <p className="text-sm text-text-secondary">
                {warehouse.lotCount} lô · {warehouse.totalQuantity.toLocaleString("vi-VN")} mẫu mẹ
              </p>
            </div>
            <Link href={`/instructions/mother-due/${warehouse.warehouseId}`}>
              <Button type="button" size="sm" className="bg-primary hover:bg-primary-hover shrink-0">
                <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
