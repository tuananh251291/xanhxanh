"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
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

type ForecastEntryRow = { entryId: string; assignedStaffId: string; staffCode: string; staffName: string; quantity: number };
type ForecastPlantTypeRow = { plantTypeId: string; code: string; name: string; entries: ForecastEntryRow[]; totalQuantity: number };
type AvailableStaff = { id: string; code: string; name: string };
type ForecastStatus = {
  taskMonth: string;
  deadline: string;
  plantTypes: ForecastPlantTypeRow[];
  availableStaff: AvailableStaff[];
  isComplete: boolean;
  completedAt: string | null;
  isOnTime: boolean | null;
};
type ComboOption = { value: string; label: string };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [addStaffOption, setAddStaffOption] = useState<Record<string, ComboOption | null>>({});
  const [addQuantity, setAddQuantity] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const applyStatus = useCallback((data: ForecastStatus) => {
    setStatus(data);
    setEditValues(
      Object.fromEntries(data.plantTypes.flatMap((p) => p.entries.map((e) => [e.entryId, e.quantity.toString()])))
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooting-forecast");
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Không tải được dữ liệu");
        return;
      }
      applyStatus(data);
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => { load(); }, [load]);

  const staffOptions: ComboOption[] = useMemo(
    () => (status?.availableStaff ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [status]
  );

  const saveEntry = async (plantTypeId: string, assignedStaffId: string, quantityRaw: string, key: string) => {
    const quantity = Number(quantityRaw);
    if (quantityRaw.trim() === "" || !Number.isInteger(quantity) || quantity < 0) {
      toast.error("Nhập số lượng hợp lệ (số nguyên, không âm)");
      return;
    }
    setBusyKey(key);
    try {
      const res = await fetch("/api/rooting-forecast", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantTypeId, assignedStaffId, quantity }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Lưu thất bại");
        return;
      }
      applyStatus(data);
      toast.success("Đã lưu");
    } finally {
      setBusyKey(null);
    }
  };

  const addEntry = async (plantTypeId: string) => {
    const staffOption = addStaffOption[plantTypeId];
    if (!staffOption) {
      toast.error("Chọn NV cấy mô");
      return;
    }
    await saveEntry(plantTypeId, staffOption.value, addQuantity[plantTypeId] ?? "", `add-${plantTypeId}`);
    setAddStaffOption((prev) => ({ ...prev, [plantTypeId]: null }));
    setAddQuantity((prev) => ({ ...prev, [plantTypeId]: "" }));
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
      if (!res.ok) {
        toast.error(data?.message ?? "Xoá thất bại");
        return;
      }
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

        {status.plantTypes.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">
            Cơ sở sản xuất của bạn hiện chưa có mã cây nào đang hoạt động
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-primary-strong">
                  <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
                  <th className="px-3 py-2 text-left font-bold text-base">Tên cây</th>
                  <th className="px-3 py-2 text-left font-bold text-base">NV cấy mô</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Số lượng dự kiến</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {status.plantTypes.map((p) => {
                  const rowSpan = p.entries.length + 1;
                  return (
                    <Fragment key={p.plantTypeId}>
                      {p.entries.map((e, idx) => (
                        <tr key={e.entryId} className="border-b even:bg-primary-light">
                          {idx === 0 && (
                            <>
                              <td className="px-3 py-2 font-mono align-top" rowSpan={rowSpan}>{p.code}</td>
                              <td className="px-3 py-2 align-top" rowSpan={rowSpan}>
                                {p.name}
                                <div className="text-xs text-text-muted mt-1">Tổng: {p.totalQuantity.toLocaleString("vi-VN")}</div>
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 text-text-secondary">{e.staffCode} — {e.staffName}</td>
                          <td className="px-2 py-2">
                            <Input
                              type="number" min={0}
                              value={editValues[e.entryId] ?? ""}
                              onChange={(ev) => setEditValues((prev) => ({ ...prev, [e.entryId]: ev.target.value }))}
                              className="w-28 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button" size="icon-sm" variant="outline"
                                disabled={busyKey === `edit-${e.entryId}`}
                                onClick={() => saveEntry(p.plantTypeId, e.assignedStaffId, editValues[e.entryId] ?? "", `edit-${e.entryId}`)}
                              >
                                {busyKey === `edit-${e.entryId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
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
                      ))}
                      <tr key={`${p.plantTypeId}-add`} className="border-b even:bg-primary-light">
                        {p.entries.length === 0 && (
                          <>
                            <td className="px-3 py-2 font-mono align-top" rowSpan={1}>{p.code}</td>
                            <td className="px-3 py-2 align-top" rowSpan={1}>{p.name}</td>
                          </>
                        )}
                        <td className="px-2 py-2">
                          <Combobox
                            items={staffOptions}
                            value={addStaffOption[p.plantTypeId] ?? null}
                            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                            onValueChange={(v) => setAddStaffOption((prev) => ({ ...prev, [p.plantTypeId]: v as ComboOption | null }))}
                          >
                            <ComboboxInputGroup className="w-48 h-9">
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
                            value={addQuantity[p.plantTypeId] ?? ""}
                            onChange={(ev) => setAddQuantity((prev) => ({ ...prev, [p.plantTypeId]: ev.target.value }))}
                            className="w-28 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={busyKey === `add-${p.plantTypeId}` || staffOptions.length === 0}
                            onClick={() => addEntry(p.plantTypeId)}
                          >
                            {busyKey === `add-${p.plantTypeId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                            Thêm NV
                          </Button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
