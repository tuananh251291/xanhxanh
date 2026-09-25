"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Boxes, Package, PackageCheck, PackageX, Sprout } from "lucide-react";
import { ROOM_TYPE_LABELS } from "@/types";
import type { RoomType } from "@prisma/client";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

type Lot = { quantity: number; stageCode: string; plantTypeId: string; plantType: { code: string; name: string } };
type RoomData = { id: string; name: string; type: RoomType; warehouseName: string; lots: Lot[] };
type PlantOption = { value: string; label: string; code: string; name: string };

const ROOM_ICONS: Partial<Record<RoomType, typeof Package>> = {
  PHONG_SAN_PHAM_DAT: PackageCheck,
  PHONG_SAN_PHAM_KHONG_DAT: PackageX,
  PHONG_CAY_TRONG: Sprout,
};

// Gõ tên/mã cây sẽ tự gợi ý (Combobox lọc sẵn danh sách loại cây đang có hàng trong 3 phòng, giống
// StaffFilterCombobox) — khác chỗ ở đây gõ/chọn lọc NGAY bảng tồn kho hiển thị bên dưới (không submit
// form, không query lại server) vì dữ liệu 1 kho thị trường nhỏ, load 1 lần là đủ.
export default function ThiTruongInventoryBoard({
  rooms,
  showWarehouseName,
}: {
  rooms: RoomData[];
  showWarehouseName: boolean;
}) {
  const [search, setSearch] = useState("");

  const plantOptions = useMemo(() => {
    const map = new Map<string, PlantOption>();
    for (const room of rooms) {
      for (const lot of room.lots) {
        if (!map.has(lot.plantTypeId)) {
          map.set(lot.plantTypeId, {
            value: lot.plantTypeId,
            label: `${lot.plantType.name} (${lot.plantType.code})`,
            code: lot.plantType.code,
            name: lot.plantType.name,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [rooms]);

  const q = search.trim().toLowerCase();
  const totalQuantity = rooms.reduce((s, r) => s + r.lots.reduce((rs, l) => rs + l.quantity, 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary-strong" /> Tồn kho
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tồn thực tế tại 3 phòng Kho thị trường · {totalQuantity.toLocaleString("vi-VN")} cây
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tìm theo tên cây / mã cây</CardTitle>
        </CardHeader>
        <CardContent>
          <Combobox items={plantOptions} inputValue={search} onInputValueChange={setSearch}>
            <ComboboxInputGroup className="h-9 w-full max-w-sm">
              <ComboboxInput placeholder="Gõ tên hoặc mã cây…" />
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>Không tìm thấy cây phù hợp</ComboboxEmpty>
              <ComboboxList>
                {(item: PlantOption) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </CardContent>
      </Card>

      {rooms.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-text-muted">
            <Boxes className="w-10 h-10 mx-auto mb-3 text-text-muted" />
            <p>Chưa có phòng Kho thị trường nào</p>
          </CardContent>
        </Card>
      )}

      {rooms.map((room) => {
        const Icon = ROOM_ICONS[room.type] ?? Package;
        const aggMap = new Map<string, { code: string; name: string; stageCode: string; quantity: number }>();
        for (const lot of room.lots) {
          if (q && !lot.plantType.code.toLowerCase().includes(q) && !lot.plantType.name.toLowerCase().includes(q)) continue;
          const key = `${lot.plantTypeId}:${lot.stageCode}`;
          const existing = aggMap.get(key) ?? { code: lot.plantType.code, name: lot.plantType.name, stageCode: lot.stageCode, quantity: 0 };
          existing.quantity += lot.quantity;
          aggMap.set(key, existing);
        }
        const rows = Array.from(aggMap.values()).sort((a, b) =>
          a.code === b.code ? a.stageCode.localeCompare(b.stageCode) : a.code.localeCompare(b.code)
        );
        const roomTotal = rows.reduce((s, r) => s + r.quantity, 0);

        return (
          <Card key={room.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <Icon className="w-5 h-5 text-primary-strong shrink-0" />
                {room.name}
                <span className="text-xs font-normal text-text-secondary">
                  ({ROOM_TYPE_LABELS[room.type]}{showWarehouseName ? ` · ${room.warehouseName}` : ""})
                </span>
                <span className="text-xs font-normal text-text-muted ml-auto">
                  {rows.length} loại cây · {roomTotal.toLocaleString("vi-VN")} cây
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="text-text-muted text-sm px-4 py-6 text-center">
                  {q ? "Không có cây phù hợp trong phòng này" : "Phòng trống"}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã cây</th>
                        <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên cây</th>
                        <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Quy cách</th>
                        <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Số lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.code}:${row.stageCode}`} className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-2 font-mono text-xs">{row.code}</td>
                          <td className="px-4 py-2">{row.name}</td>
                          <td className="px-4 py-2 font-medium">{row.stageCode}</td>
                          <td className="px-4 py-2 text-right font-medium">{row.quantity.toLocaleString("vi-VN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
