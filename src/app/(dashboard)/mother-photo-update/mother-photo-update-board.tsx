"use client";

import { useCallback, useRef, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CheckCircle2, ImageUp, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/image-compress";

type ShelfPlantType = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  transferWaitWeeks: number;
  lotId: string;
  enteredWeek: number;
  motherMediumCode: string | null;
  motherMediumName: string | null;
};
type ShelfOption = { id: string; code: string; name: string; rotationOrder: number | null; plantTypes: ShelfPlantType[] };

type Capture = { weekIndex: number; saving: boolean; saved: { id: string; imageUrl: string } | null };

function suggestWeekIndex(shelf: ShelfOption, transferWaitWeeks: number): number {
  const maxIndex = Math.max(1, transferWaitWeeks - 1);
  const order = shelf.rotationOrder;
  if (order && order >= 1 && order <= maxIndex) return order;
  return 1;
}

function captureKey(lotId: string) {
  return lotId;
}

export default function MotherPhotoUpdateBoard({
  totalPlantTypes,
  initialPhotographedPlantTypeIds,
}: {
  totalPlantTypes: number;
  initialPhotographedPlantTypeIds: string[];
}) {
  const [rows, setRows] = useState<{ key: string; shelf: ShelfOption | null; options: ShelfOption[]; loading: boolean }[]>([
    { key: crypto.randomUUID(), shelf: null, options: [], loading: false },
  ]);
  const [captures, setCaptures] = useState<Record<string, Capture>>({});
  const [photographedSet, setPhotographedSet] = useState<Set<string>>(new Set(initialPhotographedPlantTypeIds));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTargetRef = useRef<{ lotId: string; shelfId: string; weekIndex: number; plantTypeId: string } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const percent = totalPlantTypes === 0 ? 100 : Math.round((photographedSet.size / totalPlantTypes) * 100);

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
    setCaptures((prev) => {
      const next = { ...prev };
      for (const pt of shelf.plantTypes) {
        const key = captureKey(pt.lotId);
        if (!next[key]) next[key] = { weekIndex: suggestWeekIndex(shelf, pt.transferWaitWeeks), saving: false, saved: null };
      }
      return next;
    });
  };

  const addRow = () => setRows((prev) => [...prev, { key: crypto.randomUUID(), shelf: null, options: [], loading: false }]);

  const removeRow = (rowKey: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== rowKey) : prev));

  const setWeekIndex = (lotId: string, weekIndex: number) => {
    setCaptures((prev) => ({ ...prev, [captureKey(lotId)]: { ...prev[captureKey(lotId)], weekIndex, saving: false, saved: prev[captureKey(lotId)]?.saved ?? null } }));
  };

  const triggerCapture = (source: "camera" | "upload", lotId: string, shelfId: string, plantTypeId: string) => {
    const weekIndex = captures[captureKey(lotId)]?.weekIndex ?? 1;
    pendingTargetRef.current = { lotId, shelfId, weekIndex, plantTypeId };
    const input = source === "camera" ? cameraInputRef.current : uploadInputRef.current;
    if (input) {
      input.value = "";
      input.click();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = pendingTargetRef.current;
    if (!file || !target) return;
    const { lotId, shelfId, weekIndex, plantTypeId } = target;
    const key = captureKey(lotId);
    setCaptures((prev) => ({ ...prev, [key]: { ...prev[key], saving: true } }));
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
        setCaptures((prev) => ({ ...prev, [key]: { ...prev[key], saving: false } }));
        return;
      }
      setCaptures((prev) => ({ ...prev, [key]: { weekIndex, saving: false, saved: { id: json.id, imageUrl: json.imageUrl } } }));
      setPhotographedSet((prev) => new Set(prev).add(plantTypeId));
      toast.success("Đã lưu ảnh");
    } catch {
      toast.error("Nén/lưu ảnh thất bại — thử lại");
      setCaptures((prev) => ({ ...prev, [key]: { ...prev[key], saving: false } }));
    }
  };

  const retake = (lotId: string) => {
    setCaptures((prev) => ({ ...prev, [captureKey(lotId)]: { ...prev[captureKey(lotId)], saved: null } }));
  };

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
      <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

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

              {row.shelf?.plantTypes.map((pt) => {
                const cap = captures[captureKey(pt.lotId)];
                const maxIndex = Math.max(1, pt.transferWaitWeeks - 1);
                const weekOptions = Array.from({ length: maxIndex }, (_, i) => i + 1);
                return (
                  <div key={pt.lotId} className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-medium text-foreground">{pt.plantTypeName} <span className="text-text-muted font-mono text-xs">({pt.plantTypeCode})</span></p>
                        <p className="text-xs text-text-secondary">
                          Môi trường mẫu mẹ: {pt.motherMediumName ? `${pt.motherMediumName} (${pt.motherMediumCode})` : "Chưa rõ"}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Tuần nhập kho sáng: {pt.enteredWeek} · Cập nhật ảnh tuần: {weekOptions.map((w) => pt.enteredWeek + w).join(", ")}
                        </p>
                      </div>
                      {photographedSet.has(pt.plantTypeId) && (
                        <span className="text-xs text-primary-strong bg-primary-light rounded-full px-2 py-0.5">Đã chụp tuần này ✓</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="space-y-1">
                        <Label className="text-xs">Kiểu ảnh</Label>
                        <Select
                          items={weekOptions.map((w) => ({ value: String(w), label: `Tuần ${pt.enteredWeek + w}` }))}
                          value={String(cap?.weekIndex ?? 1)}
                          onValueChange={(v) => setWeekIndex(pt.lotId, Number(v))}
                        >
                          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {weekOptions.map((w) => (
                              <SelectItem key={w} value={String(w)}>Tuần {pt.enteredWeek + w}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {cap?.saving ? (
                        <div className="flex items-center gap-2 text-sm text-text-secondary">
                          <Loader2 className="w-4 h-4 animate-spin" /> Đang lưu…
                        </div>
                      ) : cap?.saved ? (
                        <div className="flex items-center gap-2">
                          <img src={cap.saved.imageUrl} alt="Ảnh đã lưu" className="w-14 h-14 object-cover rounded-md border border-border" />
                          <span className="text-sm text-primary-strong flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Đã lưu</span>
                          <Button size="sm" variant="outline" onClick={() => retake(pt.lotId)}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Chụp lại
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => triggerCapture("camera", pt.lotId, row.shelf!.id, pt.plantTypeId)}>
                            <Camera className="w-4 h-4 mr-1.5" /> Chụp ảnh
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => triggerCapture("upload", pt.lotId, row.shelf!.id, pt.plantTypeId)}>
                            <ImageUp className="w-4 h-4 mr-1.5" /> Tải ảnh lên
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
