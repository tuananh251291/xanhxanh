"use client";

import { Input } from "@/components/ui/input";

// Giờ mặc định của "Thời gian dự kiến xuất" — chỉ Quản lý kho thành phẩm được đổi giờ (xem
// normalizeExpectedShipAt, src/lib/order-ship-time.ts — server ép lại 9:00 với vai trò khác).
export const DEFAULT_SHIP_TIME = "09:00";

// Ô "Thời gian dự kiến xuất" = chọn ngày + giờ (mặc định 9:00). value/onChange dạng "yyyy-MM-ddTHH:mm"
// (giống input datetime-local cũ), "" = chưa chọn ngày.
export default function ShipAtInput({
  value, onChange, canEditTime,
}: {
  value: string;
  onChange: (value: string) => void;
  canEditTime: boolean;
}) {
  const [date, time] = value ? value.split("T") : ["", DEFAULT_SHIP_TIME];
  const currentTime = canEditTime ? time || DEFAULT_SHIP_TIME : DEFAULT_SHIP_TIME;

  return (
    <div className="flex gap-2">
      <Input
        type="date"
        className="flex-1"
        value={date}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}T${currentTime}` : "")}
      />
      <Input
        type="time"
        className="w-28"
        value={currentTime}
        disabled={!canEditTime}
        title={canEditTime ? undefined : "Mặc định 9:00 — Quản lý kho thành phẩm có thể sửa"}
        onChange={(e) => { if (date) onChange(`${date}T${e.target.value || DEFAULT_SHIP_TIME}`); }}
      />
    </div>
  );
}
