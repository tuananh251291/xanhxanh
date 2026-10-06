"use client";

import { useEffect, useState } from "react";
import { Crosshair, Loader2, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, type UserRole } from "@/types";

type SiteConfig = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  shiftStart: string;
  shiftEnd: string;
  breakStart: string | null;
  breakEnd: string | null;
  graceMinutes: number;
  approverId: string | null;
};

type SiteRow = {
  warehouseId: string;
  warehouseName: string;
  staffCount: number;
  candidates: { id: string; name: string; code: string; role: UserRole | null }[];
  site: SiteConfig | null;
};

const DEFAULT_SITE: SiteConfig = {
  latitude: null, longitude: null, radiusMeters: 150, shiftStart: "07:30", shiftEnd: "17:00",
  breakStart: "11:30", breakEnd: "13:00", graceMinutes: 5, approverId: null,
};

const NONE = "NONE";

function SiteCard({ row, onSaved }: { row: SiteRow; onSaved: () => void }) {
  const initial = row.site ?? DEFAULT_SITE;
  const [lat, setLat] = useState(initial.latitude?.toString() ?? "");
  const [lng, setLng] = useState(initial.longitude?.toString() ?? "");
  const [radius, setRadius] = useState(String(initial.radiusMeters));
  const [shiftStart, setShiftStart] = useState(initial.shiftStart);
  const [shiftEnd, setShiftEnd] = useState(initial.shiftEnd);
  const [breakStart, setBreakStart] = useState(initial.breakStart ?? "");
  const [breakEnd, setBreakEnd] = useState(initial.breakEnd ?? "");
  const [grace, setGrace] = useState(String(initial.graceMinutes));
  const [approverId, setApproverId] = useState(initial.approverId ?? NONE);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error("Thiết bị không hỗ trợ GPS"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
        toast.success(`Đã lấy vị trí hiện tại (sai số ±${Math.round(pos.coords.accuracy)}m)`);
      },
      () => { setLocating(false); toast.error("Không lấy được vị trí — kiểm tra quyền Vị trí của trình duyệt"); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  // Dán nhanh "21.0, 105.8" (copy từ Google Maps) vào ô vĩ độ.
  const onLatChange = (v: string) => {
    const m = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { setLat(m[1]); setLng(m[2]); } else setLat(v);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        latitude: lat.trim() ? Number(lat) : null,
        longitude: lng.trim() ? Number(lng) : null,
        radiusMeters: Number(radius),
        shiftStart, shiftEnd,
        breakStart: breakStart || null,
        breakEnd: breakEnd || null,
        graceMinutes: Number(grace),
        approverId: approverId === NONE ? null : approverId,
      };
      if ((body.latitude != null && Number.isNaN(body.latitude)) || (body.longitude != null && Number.isNaN(body.longitude))) {
        toast.error("Toạ độ không hợp lệ"); return;
      }
      const res = await fetch(`/api/attendance/sites/${row.warehouseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Lưu thất bại"); return; }
      toast.success(`Đã lưu cài đặt ${row.warehouseName}`);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const approverItems = {
    [NONE]: "Không có — đơn lên thẳng HCNS",
    ...Object.fromEntries(row.candidates.map((c) => [c.id, `${c.name} (${c.code}${c.role ? ` · ${ROLE_LABELS[c.role]}` : ""})`])),
  };
  const configured = !!row.site?.latitude;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <span>{row.warehouseName}</span>
          <span className={configured ? "text-xs font-medium rounded-full px-2 py-0.5 bg-primary-light text-primary-strong" : "text-xs font-medium rounded-full px-2 py-0.5 bg-warning-light text-warning-foreground"}>
            {configured ? "Đã cài vị trí" : "Chưa cài vị trí — NV chưa chấm được"}
          </span>
        </CardTitle>
        <p className="text-xs text-text-secondary">{row.staffCount} NV chấm công</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Vị trí khu (tâm vùng chấm công)</Label>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_8rem] gap-2">
            <Input placeholder="Vĩ độ (VD 20.97)" value={lat} onChange={(e) => onLatChange(e.target.value)} />
            <Input placeholder="Kinh độ (VD 105.92)" value={lng} onChange={(e) => setLng(e.target.value)} />
            <Input type="number" min={20} max={2000} value={radius} onChange={(e) => setRadius(e.target.value)} title="Bán kính (m)" />
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs text-text-secondary">
            <Button size="sm" variant="outline" onClick={useCurrentLocation} disabled={locating}>
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} Lấy vị trí hiện tại
            </Button>
            <span>hoặc dán toạ độ từ Google Maps vào ô vĩ độ · ô cuối là bán kính (m)</span>
            {lat && lng && (
              <a className="underline text-info-foreground" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">Xem trên bản đồ</a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="space-y-1"><Label>Vào ca</Label><Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} /></div>
          <div className="space-y-1"><Label>Hết ca</Label><Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} /></div>
          <div className="space-y-1"><Label>Nghỉ trưa từ</Label><Input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} /></div>
          <div className="space-y-1"><Label>Nghỉ trưa đến</Label><Input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} /></div>
          <div className="space-y-1"><Label>Cho phép muộn (phút)</Label><Input type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(e.target.value)} /></div>
        </div>

        <div className="space-y-1">
          <Label>Người duyệt đơn cấp 1 (quản lý khu)</Label>
          <Select items={approverItems} value={approverId} onValueChange={(v) => setApproverId(v as string)}>
            <SelectTrigger className="w-full sm:w-96"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(approverItems).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted">Đơn của chính người duyệt cấp 1 sẽ lên thẳng HCNS.</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SitesBoard() {
  const [rows, setRows] = useState<SiteRow[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    fetch("/api/attendance/sites")
      .then((r) => r.json())
      .then((json) => setRows(json.sites ?? []));
  }, [version]);

  if (!rows) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>;
  if (rows.length === 0) return <p className="text-sm text-text-muted">Chưa có khu nào có NV chấm công (gắn Địa điểm làm việc cho NV ở trang Người dùng).</p>;

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <SiteCard key={`${row.warehouseId}-${version}`} row={row} onSaved={() => setVersion((v) => v + 1)} />
      ))}
    </div>
  );
}
