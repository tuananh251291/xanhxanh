"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Camera, CheckCircle2, ListChecks, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/image-compress";

type CapturePlantType = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  transferWaitWeeks: number;
  lotId: string;
  enteredWeek: number;
  motherMediumCode: string | null;
  motherMediumName: string | null;
  capturedWeekIndexes: number[];
};
type ShelfOption = { id: string; code: string; name: string; rotationOrder: number | null; plantTypes: CapturePlantType[] };
type DueItem = Omit<CapturePlantType, "lotId"> & { key: string; representativeLotId: string; representativeShelfId: string; shelfCodes: string[] };

type WeekCapture = { saving: boolean; saved: boolean };
type PendingTarget = { lotId: string; shelfId: string; weekIndex: number; plantTypeId: string; dueKey?: string };

function weekCaptureKey(lotId: string, weekIndex: number) {
  return `${lotId}:${weekIndex}`;
}

export default function MotherPhotoUpdateBoard({
  totalPlantTypes,
  initialPhotographedPlantTypeIds,
}: {
  totalPlantTypes: number;
  initialPhotographedPlantTypeIds: string[];
}) {
  const [due, setDue] = useState<DueItem[]>([]);
  const [dueLoading, setDueLoading] = useState(true);
  const [rows, setRows] = useState<{ key: string; shelf: ShelfOption | null; options: ShelfOption[]; loading: boolean }[]>([
    { key: crypto.randomUUID(), shelf: null, options: [], loading: false },
  ]);
  const [weekCaptures, setWeekCaptures] = useState<Record<string, WeekCapture>>({});
  const [photographedSet, setPhotographedSet] = useState<Set<string>>(new Set(initialPhotographedPlantTypeIds));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTargetRef = useRef<PendingTarget | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const percent = totalPlantTypes === 0 ? 100 : Math.round((photographedSet.size / totalPlantTypes) * 100);

  const seedCaptured = (lotId: string, capturedWeekIndexes: number[]) => {
    if (capturedWeekIndexes.length === 0) return;
    setWeekCaptures((prev) => {
      const next = { ...prev };
      for (const wi of capturedWeekIndexes) {
        const key = weekCaptureKey(lotId, wi);
        if (!next[key]) next[key] = { saving: false, saved: true };
      }
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/mother-photo-update/due")
      .then((r) => r.json())
      .then((json) => {
        const items: DueItem[] = json.due ?? [];
        setDue(items);
        for (const d of items) seedCaptured(d.representativeLotId, d.capturedWeekIndexes);
      })
      .finally(() => setDueLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchShelves = useCallback(async (rowKey: string, q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) {
      setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, options: [] } : r)));
      return;
    }
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, loading: true } : r)));
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/mother-photo-update/shelves?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, options: json.shelves ?? [], loading: false } : r)));
    }, 300);
  }, []);

  const selectShelf = (rowKey: string, shelf: ShelfOption | null) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, shelf } : r)));
    if (!shelf) return;
    for (const pt of shelf.plantTypes) seedCaptured(pt.lotId, pt.capturedWeekIndexes);
  };

  const addRow = () => setRows((prev) => [...prev, { key: crypto.randomUUID(), shelf: null, options: [], loading: false }]);

  const removeRow = (rowKey: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== rowKey) : prev));

  const triggerCapture = (pt: CapturePlantType, shelfId: string, weekIndex: number, dueKey?: string) => {
    pendingTargetRef.current = { lotId: pt.lotId, shelfId, weekIndex, plantTypeId: pt.plantTypeId, dueKey };
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
      cameraInputRef.current.click();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = pendingTargetRef.current;
    if (!file || !target) return;
    const { lotId, shelfId, weekIndex, plantTypeId, dueKey } = target;
    const key = weekCaptureKey(lotId, weekIndex);
    setWeekCaptures((prev) => ({ ...prev, [key]: { saving: true, saved: false } }));
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const res = await fetch("/api/mother-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId, shelfId, weekIndex, image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Lưu ảnh thất bại");
        setWeekCaptures((prev) => ({ ...prev, [key]: { saving: false, saved: false } }));
        return;
      }
      setWeekCaptures((prev) => ({ ...prev, [key]: { saving: false, saved: true } }));
      setPhotographedSet((prev) => new Set(prev).add(plantTypeId));
      // Giàn khác cùng Nhóm tuần mẫu mẹ + cùng mã cây trong thẻ "cần chụp" này tự biến mất theo (đã gộp
      // sẵn ở server, xem /api/mother-photo-update/due) — chỉ cần bỏ đúng 1 thẻ dueKey khỏi danh sách.
      if (dueKey) setDue((prev) => prev.filter((d) => d.key !== dueKey));
      toast.success("Đã lưu ảnh");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nén/lưu ảnh thất bại — thử lại");
      setWeekCaptures((prev) => ({ ...prev, [key]: { saving: false, saved: false } }));
    }
  };

  function CaptureCard({ pt, shelfId, dueKey, header }: { pt: CapturePlantType; shelfId: string; dueKey?: string; header: React.ReactNode }) {
    const maxIndex = Math.max(1, pt.transferWaitWeeks - 1);
    const weekOptions = Array.from({ length: maxIndex }, (_, i) => i + 1);
    return (
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            {header}
            <p className="text-xs text-text-secondary">
              Môi trường mẫu mẹ: {pt.motherMediumName ? `${pt.motherMediumName} (${pt.motherMediumCode})` : "Chưa rõ"}
            </p>
            <p className="text-xs text-text-secondary">Tuần nhập kho sáng: {pt.enteredWeek}</p>
          </div>
          {photographedSet.has(pt.plantTypeId) && (
            <span className="text-xs text-primary-strong bg-primary-light rounded-full px-2 py-0.5">Đã chụp tuần này ✓</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {weekOptions.map((w) => {
            const cap = weekCaptures[weekCaptureKey(pt.lotId, w)];
            const saving = cap?.saving ?? false;
            const saved = cap?.saved ?? false;
            return (
              <Button
                key={w}
                size="sm"
                variant={saved ? "outline" : "default"}
                disabled={saved || saving}
                onClick={() => triggerCapture(pt, shelfId, w, dueKey)}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                ) : (
                  <Camera className="w-4 h-4 mr-1.5" />
                )}
                Tuần {pt.enteredWeek + w}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cập nhật hình ảnh định kì</h1>
        <p className="text-text-secondary text-sm mt-1">Nhiệm vụ tuần — hoàn thành đúng hạn vào Thứ 2 hoặc Thứ 3</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2 bg-info-light rounded-lg">
          <p className="text-sm text-info-foreground">
            Bạn cần chụp các mẫu mẹ của tất cả các loại cây đang được sản xuất tại cơ sở này.
          </p>
          <p className="text-sm text-info-foreground">
            Lưu ý cần chụp đúng túi đã chụp trong kì trước, góc chụp giống nhau để dễ so sánh.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tiến độ tuần này</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary mb-2">{photographedSet.size}/{totalPlantTypes} loại cây đã chụp</p>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="rounded-full h-2 bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
        </CardContent>
      </Card>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4.5 h-4.5 text-primary-strong" /> Giàn cần chụp tuần này
          </CardTitle>
          <p className="text-xs text-text-secondary">
            Chỉ tính giàn đã gắn cho nhân sự — chụp xong 1 giàn sẽ tự biến mất khỏi danh sách (kể cả với NV khác)
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {dueLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          ) : due.length === 0 ? (
            <p className="text-sm text-text-muted">Không còn giàn nào cần chụp tuần này 🎉</p>
          ) : (
            due.map((d) => (
              <CaptureCard
                key={d.key}
                pt={{ ...d, lotId: d.representativeLotId }}
                shelfId={d.representativeShelfId}
                dueKey={d.key}
                header={
                  <p className="font-medium text-foreground">
                    {d.plantTypeName} <span className="text-text-muted font-mono text-xs">({d.plantTypeCode})</span>
                    {" · "}
                    <span className="text-text-secondary font-normal text-xs">Giàn: {d.shelfCodes.join(", ")}</span>
                  </p>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Hoặc tìm giàn kệ khác</h2>
        <p className="text-xs text-text-secondary">Dùng khi cần chụp bổ sung/sửa ảnh ngoài danh sách phía trên</p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <Card key={row.key}>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label>Giàn kệ chứa mẫu mẹ</Label>
                  <Combobox
                    items={row.options}
                    value={row.shelf}
                    isItemEqualToValue={(a: ShelfOption, b: ShelfOption) => a.id === b.id}
                    itemToStringLabel={(item: ShelfOption) => `${item.code} — ${item.name}`}
                    onValueChange={(v) => selectShelf(row.key, v as ShelfOption | null)}
                    onInputValueChange={(v) => searchShelves(row.key, v)}
                  >
                    <ComboboxInputGroup className="h-10">
                      <ComboboxInput placeholder="Gõ mã hoặc tên giàn kệ…" />
                      <ComboboxTrigger />
                    </ComboboxInputGroup>
                    <ComboboxContent>
                      <ComboboxEmpty>{row.loading ? "Đang tìm…" : "Không tìm thấy giàn kệ có mẫu mẹ"}</ComboboxEmpty>
                      <ComboboxList>
                        {(item: ShelfOption) => (
                          <ComboboxItem key={item.id} value={item}>
                            {item.code} — {item.name}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
                {rows.length > 1 && (
                  <Button size="sm" variant="ghost" className="mt-6" onClick={() => removeRow(row.key)}>
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>

              {row.shelf && row.shelf.plantTypes.length === 0 && (
                <p className="text-sm text-text-muted">Giàn này chưa có mẫu mẹ đang lưu.</p>
              )}

              {row.shelf?.plantTypes.map((pt) => (
                <CaptureCard
                  key={pt.lotId}
                  pt={pt}
                  shelfId={row.shelf!.id}
                  header={
                    <p className="font-medium text-foreground">
                      {pt.plantTypeName} <span className="text-text-muted font-mono text-xs">({pt.plantTypeCode})</span>
                    </p>
                  }
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" onClick={addRow} className="gap-1.5">
        <Plus className="w-4 h-4" /> Thêm giàn kệ
      </Button>
    </div>
  );
}
