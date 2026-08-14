"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Option = { value: string; label: string };
type LotSummary = { lotId: string; lotCode: string; enteredAt: string; enteredWeek: number; coverImageUrl: string; photoCount: number };
type Photo = { id: string; weekIndex: number; realWeek: number; imageUrl: string; createdAt: string; takenBy: { name: string } };
type WeeklyStatusRow = {
  userId: string;
  name: string;
  code: string;
  weeks: { weekStart: string; percent: number; status: "HOAN_THANH" | "DA_THUC_HIEN" | "CHUA_LAM" }[];
};

const STATUS_LABEL: Record<WeeklyStatusRow["weeks"][number]["status"], { text: string; variant: "completed" | "in-progress" | "overdue" }> = {
  HOAN_THANH: { text: "Hoàn thành", variant: "completed" },
  DA_THUC_HIEN: { text: "Đã thực hiện", variant: "in-progress" },
  CHUA_LAM: { text: "Chưa làm", variant: "overdue" },
};

export default function MotherPhotoViewBoard({ plantTypeOptions }: { plantTypeOptions: Option[] }) {
  const [plantType, setPlantType] = useState<Option | null>(null);
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [selectedLot, setSelectedLot] = useState<LotSummary | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [weeklyStatus, setWeeklyStatus] = useState<{ weekStarts: string[]; rows: WeeklyStatusRow[] } | null>(null);

  useEffect(() => {
    fetch("/api/mother-photo-update/weekly-status")
      .then((r) => r.json())
      .then(setWeeklyStatus)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!plantType) {
      setLots([]);
      setSelectedLot(null);
      return;
    }
    setLoadingLots(true);
    setSelectedLot(null);
    fetch(`/api/mother-photos?plantTypeId=${plantType.value}`)
      .then((r) => r.json())
      .then((json) => setLots(json.lots ?? []))
      .finally(() => setLoadingLots(false));
  }, [plantType]);

  useEffect(() => {
    if (!selectedLot) {
      setPhotos([]);
      return;
    }
    setLoadingPhotos(true);
    fetch(`/api/mother-photos?lotId=${selectedLot.lotId}`)
      .then((r) => r.json())
      .then((json) => setPhotos(json.photos ?? []))
      .finally(() => setLoadingPhotos(false));
  }, [selectedLot]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Xem dữ liệu hình ảnh</h1>
        <p className="text-text-secondary text-sm mt-1">Ảnh mẫu mẹ theo loại cây và lô, so sánh các tuần cạnh nhau</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1 max-w-sm">
            <Label>Loại cây</Label>
            <Combobox
              items={plantTypeOptions}
              value={plantType}
              isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
              onValueChange={(v) => setPlantType(v as Option | null)}
            >
              <ComboboxInputGroup className="h-10">
                <ComboboxInput placeholder="Gõ mã hoặc tên loại cây…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                <ComboboxList>
                  {(item: Option) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {loadingLots && <Loader2 className="w-5 h-5 animate-spin text-text-muted" />}

          {!loadingLots && plantType && lots.length === 0 && (
            <p className="text-sm text-text-muted">Chưa có ảnh nào cho loại cây này.</p>
          )}

          {lots.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {lots.map((lot) => (
                <button
                  key={lot.lotId}
                  onClick={() => setSelectedLot(lot)}
                  className={`text-left rounded-lg border p-2 transition-colors ${selectedLot?.lotId === lot.lotId ? "border-primary bg-primary-light" : "border-border hover:bg-primary-light/40"}`}
                >
                  <img src={lot.coverImageUrl} alt={lot.lotCode} className="w-full aspect-square object-cover rounded-md mb-2" />
                  <p className="text-sm font-medium text-foreground truncate">{lot.lotCode}</p>
                  <p className="text-xs text-text-secondary">
                    Nhập kho sáng: {format(new Date(lot.enteredAt), "dd/MM/yyyy", { locale: vi })} (Tuần {lot.enteredWeek})
                  </p>
                  <p className="text-xs text-text-muted">{lot.photoCount} ảnh</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedLot && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">So sánh ảnh — lô {selectedLot.lotCode}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPhotos ? (
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {photos.map((p) => (
                  <div key={p.id} className="space-y-1">
                    <img src={p.imageUrl} alt={`Tuần ${p.realWeek}`} className="w-full aspect-square object-cover rounded-lg border border-border" />
                    <p className="text-sm font-medium text-foreground">Tuần {p.realWeek}</p>
                    <p className="text-xs text-text-secondary">
                      {format(new Date(p.createdAt), "dd/MM/yyyy", { locale: vi })} · {p.takenBy.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {weeklyStatus && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lịch sử hoàn thành nhiệm vụ tuần</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">NV Kỹ thuật</th>
                  {weeklyStatus.weekStarts.map((w) => (
                    <th key={w} className="text-center px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">
                      {format(new Date(w), "dd/MM", { locale: vi })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {weeklyStatus.rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-3 py-2">{row.name} <span className="text-text-muted font-mono text-xs">({row.code})</span></td>
                    {row.weeks.map((w) => (
                      <td key={w.weekStart} className="text-center px-3 py-2">
                        <Badge variant={STATUS_LABEL[w.status].variant}>{STATUS_LABEL[w.status].text}</Badge>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
