"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type NameCode = { id: string; code: string; name: string };
type ShelfRow = {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
  used: number;
  plantType: NameCode | null;
  assignedStaff: NameCode | null;
};
type ComboOption = { value: string; label: string };

const NONE = "__NONE__";
const PAGE_SIZE = 20;

export default function MotherShelfAssignBoard() {
  const [shelves, setShelves] = useState<ShelfRow[]>([]);
  const [plantTypes, setPlantTypes] = useState<NameCode[]>([]);
  const [staff, setStaff] = useState<NameCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mother-shelf-assign");
      const data = await res.json();
      setShelves(Array.isArray(data.shelves) ? data.shelves : []);
      setPlantTypes(Array.isArray(data.plantTypes) ? data.plantTypes : []);
      setStaff(Array.isArray(data.staff) ? data.staff : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const plantTypeOptions: ComboOption[] = useMemo(
    () => [{ value: NONE, label: "— Chưa gán mã cây —" }, ...plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))],
    [plantTypes]
  );
  const staffOptions: ComboOption[] = useMemo(
    () => [{ value: NONE, label: "— Chưa gán nhân viên —" }, ...staff.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))],
    [staff]
  );

  const filteredShelves = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shelves.filter((s) => {
      if (unassignedOnly && (s.plantType || s.assignedStaff)) return false;
      if (!q) return true;
      return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    });
  }, [shelves, search, unassignedOnly]);

  useEffect(() => { setPage(1); }, [search, unassignedOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredShelves.length / PAGE_SIZE));
  const pageShelves = filteredShelves.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const patchShelf = async (shelfId: string, field: "plantTypeId" | "assignedStaffId", value: string) => {
    const key = `${shelfId}::${field}`;
    setSavingKey(key);
    try {
      const res = await fetch(`/api/mother-shelf-assign/${shelfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === NONE ? null : value }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setShelves((prev) => prev.map((s) => (s.id === shelfId ? { ...s, plantType: json.plantType, assignedStaff: json.assignedStaff } : s)));
      toast.success(`Đã cập nhật kệ ${json.code}`);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (shelves.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <p>Bạn chưa được gán địa điểm làm việc, hoặc kho của bạn chưa có giàn kệ Phòng mẫu mẹ nào — liên hệ Admin.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Tìm theo giàn kệ</Label>
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="VD: A01C01"
              className="w-56"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <Checkbox checked={unassignedOnly} onCheckedChange={(v) => setUnassignedOnly(!!v)} />
            Chỉ hiện kệ chưa gán
          </label>
          <p className="text-sm text-text-secondary pb-2 ml-auto">{filteredShelves.length} / {shelves.length} kệ</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Giàn kệ</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tồn / Sức chứa</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base w-64">Mã cây</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base w-64">Nhân viên phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {pageShelves.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-text-muted">Không tìm thấy giàn kệ phù hợp</td></tr>
                ) : (
                  pageShelves.map((shelf) => {
                    const plantSaving = savingKey === `${shelf.id}::plantTypeId`;
                    const staffSaving = savingKey === `${shelf.id}::assignedStaffId`;
                    return (
                      <tr key={shelf.id} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-medium text-info-foreground">{shelf.code}</span>
                          <span className="text-text-secondary text-sm ml-2">{shelf.name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-text-secondary">
                          {shelf.used.toLocaleString("vi-VN")} / {shelf.capacity?.toLocaleString("vi-VN") ?? "không giới hạn"} cụm
                        </td>
                        <td className="px-4 py-2.5">
                          <Combobox
                            items={plantTypeOptions}
                            value={plantTypeOptions.find((o) => o.value === (shelf.plantType?.id ?? NONE)) ?? null}
                            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                            onValueChange={(v) => v && patchShelf(shelf.id, "plantTypeId", v.value)}
                          >
                            <ComboboxInputGroup className="w-full h-9">
                              <ComboboxInput placeholder="Gõ mã hoặc tên cây…" disabled={plantSaving} />
                              <ComboboxTrigger />
                            </ComboboxInputGroup>
                            <ComboboxContent>
                              <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                              <ComboboxList>
                                {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </td>
                        <td className="px-4 py-2.5">
                          <Combobox
                            items={staffOptions}
                            value={staffOptions.find((o) => o.value === (shelf.assignedStaff?.id ?? NONE)) ?? null}
                            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                            onValueChange={(v) => v && patchShelf(shelf.id, "assignedStaffId", v.value)}
                          >
                            <ComboboxInputGroup className="w-full h-9">
                              <ComboboxInput placeholder="Gõ tên hoặc mã NV…" disabled={staffSaving} />
                              <ComboboxTrigger />
                            </ComboboxInputGroup>
                            <ComboboxContent>
                              <ComboboxEmpty>Không tìm thấy nhân viên</ComboboxEmpty>
                              <ComboboxList>
                                {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-sm text-text-secondary">Trang {page}/{totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Trước
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Sau <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
