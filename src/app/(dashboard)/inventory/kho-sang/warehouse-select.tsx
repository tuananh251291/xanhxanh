"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { value: string; label: string };

// Mục "gộp mọi cơ sở" — chọn mục này (hoặc để trống) = xem dạng thẻ gộp toàn bộ kho như cũ; chọn đúng 1
// kho mới chuyển Phòng ra rễ sang xem dạng bảng như NV kho mô (xem page.tsx, rawWarehouseId).
const ALL_WAREHOUSE_VALUE = "__ALL_WAREHOUSE__";

// Ô chọn "Kho sản xuất" của Quản lý kho thành phẩm khi xem Phòng ra rễ mọi cơ sở — ÁP DỤNG NGAY khi chọn
// (điều hướng thẳng, khác RootingPlantSearch cần bấm "Xem dữ liệu" mới áp dụng) vì đây là chuyển hẳn chế
// độ xem (thẻ gộp <-> bảng theo kho), không phải lọc chi tiết. Giữ nguyên plantTypeId/enteredWeekFrom/
// enteredWeekTo đang lọc ở RootingPlantSearch khi đổi kho.
//
// Bắt buộc truyền `items` cho <Select> — value ở đây là Warehouse.id (cuid), không phải chuỗi người đọc
// được. Base UI Select.Value chỉ tự suy ra nhãn hiển thị từ prop `items` của chính <Select>, KHÔNG tự đọc
// text con của <SelectItem> (khác giả định thường gặp ở Radix) — thiếu `items` sẽ hiện thẳng cuid trong ô
// đã chọn thay vì tên kho (lỗi đã gặp thực tế).
export default function WarehouseSelect({ warehouseOptions }: { warehouseOptions: Option[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentWarehouseId = searchParams.get("warehouseId") ?? ALL_WAREHOUSE_VALUE;

  const items = [
    { value: ALL_WAREHOUSE_VALUE, label: "— Tất cả cơ sở (gộp) —" },
    ...warehouseOptions,
  ];

  const handleChange = (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL_WAREHOUSE_VALUE) params.delete("warehouseId");
    else params.set("warehouseId", value);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-1 w-72">
      <Label className="text-xs">Kho sản xuất</Label>
      <Select items={items} value={currentWarehouseId} onValueChange={handleChange}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
