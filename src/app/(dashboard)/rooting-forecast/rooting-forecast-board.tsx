"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type ForecastEntryRow = {
  entryId: string;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  assignedStaffId: string; staffCode: string; staffName: string;
  quantity: number;
};
type AvailableStaff = { id: string; code: string; name: string };
type PlantType = { id: string; code: string; name: string };
type ForecastStatus = {
  taskMonth: string;
  deadline: string;
  entries: ForecastEntryRow[];
  availableStaff: AvailableStaff[];
  isComplete: boolean;
  completedAt: string | null;
  isOnTime: boolean | null;
};
type ComboOption = { value: string; label: string };

const DEFAULT_BLANK_ROWS = 10;

type DraftRow = { key: string; plantTypeOption: ComboOption | null; staffOption: ComboOption | null; quantity: string };

function newDraftRow(): DraftRow {
  return { key: `draft-${Math.random().toString(36).slice(2)}`, plantTypeOption: null, staffOption: null, quantity: "" };
}

function StatusBadge({ status }: { status: ForecastStatus }) {
  const deadline = new Date(status.deadline);
  const isPastDeadline = new Date() >= deadline;

  if (status.isComplete) {
    return status.isOnTime ? (
      <Badge variant="completed">Đã hoàn thành — Đúng hạn</Badge>
    ) : (
      <Badge variant="overdue">Đã hoàn thành — Trễ hạn</Badge>
    );
  }
  return isPastDeadline ? (
    <Badge variant="overdue">Quá hạn — Chưa hoàn thành</Badge>
  ) : (
    <Badge variant="info">Đang chờ nhập</Badge>
  );
}

export default function RootingForecastBoard() {
  const [status, setStatus] = useState<ForecastStatus | null>(null);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dòng ĐÃ LƯU — sửa/xoá được, giữ giá trị đang chỉnh riêng theo entryId.
  const [savedEditValues, setSavedEditValues] = useState<Record<string, { plantTypeOption: ComboOption; staffOption: ComboOption; quantity: string }>>({});
  // Dòng NHÁP — chưa lưu, chỉ tồn tại ở client, mặc định 10 dòng trống.
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => Array.from({ length: DEFAULT_BLANK_ROWS }, newDraftRow));
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const applyStatus = useCallback((data: ForecastStatus) => {
    setStatus(data);
    setSavedEditValues(
      Object.fromEntries(
        data.entries.map((e) => [
          e.entryId,
          {
            plantTypeOption: { value: e.plantTypeId, label: `${e.plantTypeCode} — ${e.plantTypeName}` },
            staffOption: { value: e.assignedStaffId, label: `${e.staffCode} — ${e.staffName}` },
            quantity: e.quantity.toString(),
          },
        ])
      )
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusRes, plantTypesRes] = await Promise.all([
        fetch("/api/rooting-forecast"),
        fetch("/api/plant-types"),
      ]);
      const statusData = await statusRes.json();
      if (!statusRes.ok) {
        setError(statusData?.message ?? "Không tải được dữ liệu");
        return;
      }
      applyStatus(statusData);
      const plantTypesData = await plantTypesRes.json();
      setPlantTypes(Array.isArray(plantTypesData) ? plantTypesData : []);
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => { load(); }, [load]);

  const plantTypeOptions: ComboOption[] = useMemo(() => plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })), [plantTypes]);
  const staffOptions: ComboOption[] = useMemo(
    () => (status?.availableStaff ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [status]
  );

  const saveRow = async (plantTypeId: string, assignedStaffId: string, quantityRaw: string, key: string, onSuccess: () => void) => {
    if (quantityRaw.trim() === "") { toast.error("Nhập số lượng"); return; }
    const quantity = Number(quantityRaw);
    if (!Number.isInteger(quantity) || quantity < 0) { toast.error("Số lượng phải là số nguyên, không âm"); return; }
    setBusyKey(key);
    try {
      const res = await fetch("/api/rooting-forecast", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantTypeId, assignedStaffId, quantity }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message ?? "Lưu thất bại"); return; }
      applyStatus(data);
      toast.success("Đã lưu");
      onSuccess();
    } finally {
      setBusyKey(null);
    }
  };

  const saveDraftRow = (row: DraftRow) => {
    if (!row.plantTypeOption) { toast.error("Chọn mã cây"); return; }
    if (!row.staffOption) { toast.error("Chọn NV cấy mô"); return; }
    saveRow(row.plantTypeOption.value, row.staffOption.value, row.quantity, row.key, () => {
      setDraftRows((prev) => prev.filter((r) => r.key !== row.key));
    });
  };

  const saveExistingRow = (entryId: string) => {
    const v = savedEditValues[entryId];
    if (!v) return;
    saveRow(v.plantTypeOption.value, v.staffOption.value, v.quantity, `saved-${entryId}`, () => {});
  };

  const removeEntry = async (entryId: string) => {
    setBusyKey(`del-${entryId}`);
    try {
      const res = await fetch("/api/rooting-forecast", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message ?? "Xoá thất bại"); return; }
      applyStatus(data);
      toast.success("Đã xoá");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }
  if (error) {
    return <Card><CardContent className="py-12 text-center text-text-secondary">{error}</CardContent></Card>;
  }
  if (!status) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-text-secondary">
            Kỳ dự báo: <strong className="text-foreground">tháng {format(new Date(status.deadline), "MM/yyyy")} tới</strong>
            {" "}· Hạn hoàn thành: <strong className="text-foreground">{format(new Date(status.deadline), "dd/MM/yyyy")}</strong>
          </p>
          <StatusBadge status={status} />
        </div>

        {status.availableStaff.length === 0 && (
          <p className="text-sm text-warning-foreground bg-warning-light rounded-md px-3 py-2">
            Cơ sở sản xuất của bạn hiện chưa có NV cấy mô nào — cần Admin cấp cao gán NV cấy mô vào cơ sở
            này trước khi gắn được với từng mã cây.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light text-primary-strong">
                <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
                <th className="px-3 py-2 text-left font-bold text-base">NV cấy mô</th>
                <th className="px-3 py-2 text-center font-bold text-base">Số lượng dự kiến</th>
                <th className="px-3 py-2 text-center font-bold text-base">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {status.entries.map((e) => {
                const v = savedEditValues[e.entryId];
                if (!v) return null;
                return (
                  <tr key={e.entryId} className="border-b even:bg-primary-light">
                    <td className="px-2 py-2">
                      <Combobox
                        items={plantTypeOptions}
                        value={v.plantTypeOption}
                        isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                        onValueChange={(val) => setSavedEditValues((prev) => ({ ...prev, [e.entryId]: { ...prev[e.entryId], plantTypeOption: val as ComboOption } }))}
                      >
                        <ComboboxInputGroup className="w-52 h-9">
                          <ComboboxInput placeholder="Gõ mã/tên cây…" />
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
                    <td className="px-2 py-2">
                      <Combobox
                        items={staffOptions}
                        value={v.staffOption}
                        isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                        onValueChange={(val) => setSavedEditValues((prev) => ({ ...prev, [e.entryId]: { ...prev[e.entryId], staffOption: val as ComboOption } }))}
                      >
                        <ComboboxInputGroup className="w-52 h-9">
                          <ComboboxInput placeholder="Gõ mã/tên NV…" />
                          <ComboboxTrigger />
                        </ComboboxInputGroup>
                        <ComboboxContent>
                          <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                          <ComboboxList>
                            {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number" min={0}
                        value={v.quantity}
                        onChange={(ev) => setSavedEditValues((prev) => ({ ...prev, [e.entryId]: { ...prev[e.entryId], quantity: ev.target.value } }))}
                        className="w-28 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button" size="icon-sm" variant="outline"
                          disabled={busyKey === `saved-${e.entryId}`}
                          onClick={() => saveExistingRow(e.entryId)}
                        >
                          {busyKey === `saved-${e.entryId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          type="button" size="icon-sm" variant="ghost"
                          disabled={busyKey === `del-${e.entryId}`}
                          onClick={() => removeEntry(e.entryId)}
                        >
                          {busyKey === `del-${e.entryId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-destructive" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {draftRows.map((row) => (
                <tr key={row.key} className="border-b even:bg-primary-light">
                  <td className="px-2 py-2">
                    <Combobox
                      items={plantTypeOptions}
                      value={row.plantTypeOption}
                      isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                      onValueChange={(val) => setDraftRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, plantTypeOption: val as ComboOption | null } : r)))}
                    >
                      <ComboboxInputGroup className="w-52 h-9">
                        <ComboboxInput placeholder="Gõ mã/tên cây…" />
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
                  <td className="px-2 py-2">
                    <Combobox
                      items={staffOptions}
                      value={row.staffOption}
                      isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                      onValueChange={(val) => setDraftRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, staffOption: val as ComboOption | null } : r)))}
                    >
                      <ComboboxInputGroup className="w-52 h-9">
                        <ComboboxInput placeholder="Gõ mã/tên NV…" />
                        <ComboboxTrigger />
                      </ComboboxInputGroup>
                      <ComboboxContent>
                        <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                        <ComboboxList>
                          {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number" min={0}
                      placeholder="Số lượng"
                      value={row.quantity}
                      onChange={(ev) => setDraftRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, quantity: ev.target.value } : r)))}
                      className="w-28 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button" size="icon-sm" variant="outline"
                        disabled={busyKey === row.key || staffOptions.length === 0}
                        onClick={() => saveDraftRow(row)}
                      >
                        {busyKey === row.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        type="button" size="icon-sm" variant="ghost"
                        onClick={() => setDraftRows((prev) => prev.filter((r) => r.key !== row.key))}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => setDraftRows((prev) => [...prev, newDraftRow()])}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm dòng
        </Button>
      </CardContent>
    </Card>
  );
}
