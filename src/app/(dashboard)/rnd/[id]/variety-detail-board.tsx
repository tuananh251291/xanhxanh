"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PhotoCaptureSlot from "@/components/shared/photo-capture-slot";
import { ArrowLeft, Camera, Loader2, Play, Sprout } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Photo = { id: string; photoUrl1: string; photoUrl2: string | null; note: string | null; createdAt: string; uploadedBy: { name: string } };
type Round = {
  id: string; motherInputQuantity: number; waitWeeks: number; plantedAt: string; expectedReadyAt: string;
  outputQuantity: number | null; recordedAt: string | null; notes: string | null;
};
type VarietyDetail = {
  id: string; code: string; name: string; plantGroup: string; description: string | null; origin: string | null;
  createdAt: string; createdBy: { name: string };
  photos: Photo[];
  rounds: Round[];
};

export default function VarietyDetailBoard({ varietyId }: { varietyId: string }) {
  const [variety, setVariety] = useState<VarietyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trial-varieties/${varietyId}`);
      if (!res.ok) { setVariety(null); return; }
      setVariety(await res.json());
    } finally {
      setLoading(false);
    }
  }, [varietyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }
  if (!variety) {
    return <p className="text-sm text-text-muted text-center py-20">Không tìm thấy giống thử nghiệm</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/rnd" className="text-sm text-text-secondary hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Quay lại R&D
        </Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> {variety.name}
          <span className="font-mono text-lg text-info-foreground">({variety.code})</span>
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Loại cây: <strong className="text-foreground">{variety.plantGroup}</strong>
          {variety.origin && <> · Nguồn gốc: <strong className="text-foreground">{variety.origin}</strong></>}
          {" "}· Tạo lúc {format(new Date(variety.createdAt), "dd/MM/yyyy", { locale: vi })} bởi {variety.createdBy.name}
        </p>
        {variety.description && <p className="text-sm text-text-secondary mt-2 whitespace-pre-line">{variety.description}</p>}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Lịch sử ảnh ({variety.photos.length} đợt)</CardTitle>
            <AddPhotoDialog varietyId={varietyId} onAdded={load} />
          </div>
        </CardHeader>
        <CardContent>
          {variety.photos.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có ảnh nào</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {variety.photos.map((p) => (
                <div key={p.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-2 gap-0.5 bg-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photoUrl1} alt="Ảnh 1" className="w-full aspect-square object-cover" />
                    {p.photoUrl2 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl2} alt="Ảnh 2" className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-muted" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs text-text-secondary">
                      {format(new Date(p.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })} — {p.uploadedBy.name}
                    </p>
                    {p.note && <p className="text-xs text-foreground mt-1">{p.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Lịch sử lượt cấy ({variety.rounds.length})</CardTitle>
            <StartRoundDialog varietyId={varietyId} onStarted={load} />
          </div>
        </CardHeader>
        <CardContent>
          {variety.rounds.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có lượt cấy nào — bấm &quot;Bắt đầu lượt cấy mới&quot;</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-left text-primary-strong">
                    <th className="py-2 px-3 font-bold text-base">Ngày cấy</th>
                    <th className="py-2 px-3 font-bold text-base text-center">Mẫu mẹ đưa vào</th>
                    <th className="py-2 px-3 font-bold text-base text-center">Số tuần chờ</th>
                    <th className="py-2 px-3 font-bold text-base">Dự kiến sẵn sàng</th>
                    <th className="py-2 px-3 font-bold text-base text-center">Cây trả ra</th>
                    <th className="py-2 px-3 font-bold text-base">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {variety.rounds.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="py-2 px-3 whitespace-nowrap">{format(new Date(r.plantedAt), "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="py-2 px-3 text-center tabular-nums">{r.motherInputQuantity.toLocaleString("vi-VN")}</td>
                      <td className="py-2 px-3 text-center tabular-nums">{r.waitWeeks}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{format(new Date(r.expectedReadyAt), "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="py-2 px-3 text-center">
                        {r.outputQuantity === null ? (
                          <Badge variant="in-progress">Chưa nhập</Badge>
                        ) : (
                          <span className="font-semibold text-primary-strong tabular-nums">{r.outputQuantity.toLocaleString("vi-VN")}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-text-secondary">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddPhotoDialog({ varietyId, onAdded }: { varietyId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [photo1, setPhoto1] = useState<string | null>(null);
  const [photo2, setPhoto2] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setPhoto1(null); setPhoto2(null); setNote(""); };

  const submit = async () => {
    if (!photo1) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trial-varieties/${varietyId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo1, photo2: photo2 ?? undefined, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Tải ảnh lên thất bại"); return; }
      toast.success("Đã thêm đợt ảnh mới");
      reset();
      setOpen(false);
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        <Camera className="w-3.5 h-3.5 mr-1.5" /> Cập nhật ảnh
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm đợt cập nhật ảnh</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="flex gap-4">
            <PhotoCaptureSlot label="Ảnh 1" dataUrl={photo1} onChange={setPhoto1} required />
            <PhotoCaptureSlot label="Ảnh 2 (tuỳ chọn)" dataUrl={photo2} onChange={setPhoto2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={!photo1 || saving} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Lưu ảnh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StartRoundDialog({ varietyId, onStarted }: { varietyId: string; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const [motherInputQuantity, setMotherInputQuantity] = useState("");
  const [waitWeeks, setWaitWeeks] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setMotherInputQuantity(""); setWaitWeeks(""); setNotes(""); };

  const submit = async () => {
    const mother = Number(motherInputQuantity);
    const weeks = Number(waitWeeks);
    if (!Number.isInteger(mother) || mother <= 0) { toast.error("Nhập số lượng mẫu mẹ hợp lệ"); return; }
    if (!Number.isInteger(weeks) || weeks <= 0) { toast.error("Nhập số tuần chờ hợp lệ"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/trial-varieties/${varietyId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motherInputQuantity: mother, waitWeeks: weeks, notes: notes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Bắt đầu lượt cấy thất bại"); return; }
      toast.success("Đã bắt đầu lượt cấy mới");
      reset();
      setOpen(false);
      onStarted();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button type="button" size="sm" className="bg-primary hover:bg-primary-hover" />}>
        <Play className="w-3.5 h-3.5 mr-1.5" /> Bắt đầu lượt cấy mới
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bắt đầu lượt cấy mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Số lượng mẫu mẹ đưa vào cấy <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={motherInputQuantity} onChange={(e) => setMotherInputQuantity(e.target.value)} placeholder="VD: 10" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số tuần chờ đến tuổi cấy <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={waitWeeks} onChange={(e) => setWaitWeeks(e.target.value)} placeholder="VD: 5" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={saving || !motherInputQuantity || !waitWeeks} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Bắt đầu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
