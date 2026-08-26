"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, FileSpreadsheet } from "lucide-react";
import GoodsReceiptForm from "./goods-receipt-form";
import ExcelImportCard from "@/components/shared/excel-import-card";

type GoodsReceiptFormProps = React.ComponentProps<typeof GoodsReceiptForm>;

// 2 nút hành động cạnh tiêu đề tab "Nhận hàng từ NCC" (/goods-receipts) — mở dialog thay vì chiếm chỗ cố
// định trên trang.
export default function GoodsReceiptActions({
  rooms, plantTypes, suppliers, gardens,
}: Pick<GoodsReceiptFormProps, "rooms" | "plantTypes" | "suppliers" | "gardens">) {
  const [formOpen, setFormOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogTrigger render={<Button size="sm" className="bg-primary hover:bg-primary-hover" />}>
          <Plus className="w-4 h-4 mr-1.5" /> Tạo đơn nhập hàng
        </DialogTrigger>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <GoodsReceiptForm rooms={rooms} plantTypes={plantTypes} suppliers={suppliers} gardens={gardens} title="Tạo đơn nhập hàng" />
        </DialogContent>
      </Dialog>

      <Dialog open={excelOpen} onOpenChange={setExcelOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Tạo hàng loạt bằng Excel
        </DialogTrigger>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <ExcelImportCard
            icon={<FileSpreadsheet className="w-5 h-5" />}
            title="Tạo hàng loạt bằng Excel"
            description="Điền nhiều dòng (có thể nhiều NCC/ngày hàng về khác nhau) — mỗi nhóm cùng NCC + ngày hàng về gộp thành 1 đơn."
            templateUrl="/api/goods-receipts/import"
            uploadUrl="/api/goods-receipts/import"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
