"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PhotoCaptureSlot from "@/components/shared/photo-capture-slot";
import { Loader2, Plus, Sprout } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type VarietyRow = {
  id: string;
  code: string;
  name: string;
  plantGroup: string;
  createdAt: string;
  photoCount: number;
  roundCount: number;
  latestRound: { expectedReadyAt: string; outputQuantity: number | null } | null;
};

// Tab "Quản lý giống mới" (R&D, /rnd) — tạo giống thử nghiệm mới (2 ảnh + mô tả, mã tự sinh) + danh sách
// đã tạo, bấm vào từng dòng để xem chi tiết/cập nhật ảnh/bắt đầu lượt cấy (trang /rnd/[id]).
export default function NewVarietyManager() {
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trial-varieties");
      const data = await res.json();
      setVarieties(Array.isArray(data.varieties) ? data.varieties : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Quản lý giống mới</CardTitle>
            <p className="text-sm text-text-secondary mt-1">
              Ghi nhận giống cây mới đang thử nghiệm — tách riêng khỏi kho/tồn kho sản xuất thật.
            </p>
          </div>
          <CreateVarietyDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={() => { setCreateOpen(false); load(); }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : varieties.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Chưa có giống thử nghiệm nào — bấm &quot;Tạo giống mới&quot; để bắt đầu</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-left text-primary-strong">
                  <th className="py-2 px-3 font-bold text-base">Mã</th>
                  <th className="py-2 px-3 font-bold text-base">Tên cây</th>
                  <th className="py-2 px-3 font-bold text-base">Loại cây</th>
                  <th className="py-2 px-3 font-bold text-base">Ngày tạo</th>
                  <th className="py-2 px-3 font-bold text-base text-center">Số đợt ảnh</th>
                  <th className="py-2 px-3 font-bold text-base text-center">Số lượt cấy</th>
                  <th className="py-2 px-3 font-bold text-base"></th>
                </tr>
              </thead>
              <tbody>
                {varieties.map((v) => (
                  <tr key={v.id} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="py-2 px-3 font-mono text-info-foreground">{v.code}</td>
                    <td className="py-2 px-3 font-medium">{v.name}</td>
                    <td className="py-2 px-3 text-text-secondary">{v.plantGroup}</td>
                    <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                      {format(new Date(v.createdAt), "dd/MM/yyyy", { locale: vi })}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums">{v.photoCount}</td>
                    <td className="py-2 px-3 text-center tabular-nums">{v.roundCount}</td>
                    <td className="py-2 px-3 text-right">
                      <Link href={`/rnd/${v.id}`}>
                        <Button type="button" variant="outline" size="sm">Xem chi tiết</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateVarietyDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [plantGroup, setPlantGroup] = useState("");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState("");
  const [photo1, setPhoto1] = useState<string | null>(null);
  const [photo2, setPhoto2] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setPlantGroup(""); setDescription(""); setOrigin(""); setPhoto1(null); setPhoto2(null);
  };

  const canSubmit = name.trim() && plantGroup.trim() && photo1 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/trial-varieties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          plantGroup: plantGroup.trim(),
          description: description.trim() || undefined,
          origin: origin.trim() || undefined,
          photo1,
          photo2: photo2 ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Tạo giống mới thất bại"); return; }
      toast.success(`Đã tạo giống ${data.code}`);
      reset();
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button className="bg-primary hover:bg-primary-hover" />}>
        <Plus className="w-4 h-4 mr-1.5" /> Tạo giống mới
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sprout className="w-5 h-5" /> Tạo giống mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="flex gap-4">
            <PhotoCaptureSlot label="Ảnh 1" dataUrl={photo1} onChange={setPhoto1} required />
            <PhotoCaptureSlot label="Ảnh 2 (tuỳ chọn)" dataUrl={photo2} onChange={setPhoto2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tên cây <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Alocasia Black Velvet" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại cây <span className="text-destructive">*</span></Label>
            <Input value={plantGroup} onChange={(e) => setPlantGroup(e.target.value)} placeholder="VD: Alocasia" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nguồn gốc</Label>
            <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="VD: Sưu tầm từ vườn X, tỉnh Y" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mô tả</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Đặc điểm nhận dạng, ghi chú thêm..."
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <p className="text-xs text-text-muted">Mã giống sẽ được hệ thống tự sinh (VD: TN999) sau khi tạo.</p>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Tạo giống mới
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
