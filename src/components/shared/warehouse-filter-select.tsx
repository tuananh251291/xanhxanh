"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Warehouse = { id: string; code: string; name: string };

const ALL_VALUE = "ALL";

// Dùng chung cho 3 báo cáo ở "Giám sát & vi phạm" (Admin) / "Báo cáo vi phạm" (Kho mô, Hành chính nhân
// sự) — chỉ Admin/HCNS xem được dữ liệu KHÔNG giới hạn theo 1 kho sản xuất (Kho mô luôn tự khoá đúng kho
// mình làm việc ở server, không cần bộ lọc này). value rỗng ("") = không lọc, xem mọi cơ sở.
export default function WarehouseFilterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (warehouseId: string) => void;
}) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    fetch("/api/warehouses?type=SAN_XUAT")
      .then((r) => r.json())
      .then((data: { id: string; code: string; name: string; isActive?: boolean }[]) => {
        setWarehouses(Array.isArray(data) ? data.filter((w) => w.isActive !== false) : []);
      });
  }, []);

  return (
    <div className="space-y-1">
      <Label className="text-xs">Cơ sở sản xuất</Label>
      <Select value={value || ALL_VALUE} onValueChange={(v) => onChange(v === ALL_VALUE ? "" : (v as string))}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Mọi cơ sở sản xuất</SelectItem>
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
