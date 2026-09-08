"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import PhotoCaptureSlot from "@/components/shared/photo-capture-slot";
import { Loader2, Plus, Sprout, FolderPlus } from "lucide-react";
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
  latestRound: { expectedReadyAt: string; recordedAt: string | null } | null;
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

type ComboOption = { value: string; label: string };
type PlantCategory = { id: string; code: string; name: string; isActive: boolean; plantTypes: { seq: number; transferWaitWeeks: number }[] };

const DEFAULT_TRANSFER_WAIT_WEEKS = 4; // khớp default của PlantType.transferWaitWeeks khi Loại cây chưa có mã cây nào

function CreateVarietyDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryOption, setCategoryOption] = useState<ComboOption | null>(null);
  const [categories, setCategories] = useState<PlantCategory[]>([]);
  const [motherInputQuantity, setMotherInputQuantity] = useState("");
  const [transferWaitWeeks, setTransferWaitWeeks] = useState("");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState("");
  const [photo1, setPhoto1] = useState<string | null>(null);
  const [photo2, setPhoto2] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "Loại cây" ở đây chỉ CHỌN từ danh sách có sẵn (PlantCategory) — Admin kỹ thuật không có mục /plant-types
  // trong menu để tự thêm loại cây mới khi cần cho 1 giống thử nghiệm mới, nên cho thêm ngay tại đây
  // (POST /api/plant-categories, chỉ 2 field mã+tên, không đụng tới "mã cây"/quy cách — việc đó vẫn chỉ
  // làm được ở /plant-types).
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const loadCategories = useCallback(async () => {
    const data: PlantCategory[] = await fetch("/api/plant-categories").then((r) => r.json());
    setCategories(Array.isArray(data) ? data.filter((c) => c.isActive) : []);
    return Array.isArray(data) ? data : [];
  }, []);

  useEffect(() => {
    if (!open) return;
    loadCategories();
  }, [open, loadCategories]);

  const categoryOptions: ComboOption[] = categories.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  // Mặc định "Thời gian cấy chuyển" theo mã cây có sẵn (seq nhỏ nhất) của đúng Loại cây vừa chọn — Admin
  // kỹ thuật vẫn sửa lại được ngay sau đó, không khoá.
  const onCategoryChange = (val: ComboOption | null) => {
    setCategoryOption(val);
    const category = categories.find((c) => c.id === val?.value);
    const firstType = [...(category?.plantTypes ?? [])].sort((a, b) => a.seq - b.seq)[0];
    setTransferWaitWeeks(String(firstType?.transferWaitWeeks ?? DEFAULT_TRANSFER_WAIT_WEEKS));
  };

  const reset = () => {
    setName(""); setCategoryOption(null); setMotherInputQuantity(""); setTransferWaitWeeks("");
    setDescription(""); setOrigin(""); setPhoto1(null); setPhoto2(null);
    setNewCategoryOpen(false); setNewCategoryCode(""); setNewCategoryName("");
  };

  const createCategory = async () => {
    const code = newCategoryCode.trim().toUpperCase();
    const name = newCategoryName.trim();
    if (code.length < 2 || code.length > 3 || !/^[A-Z]+$/.test(code)) {
      toast.error("Mã loại cây phải 2-3 chữ cái");
      return;
    }
    if (name.length < 2) {
      toast.error("Nhập tên loại cây");
      return;
    }
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/plant-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Thêm loại cây thất bại"); return; }
      toast.success(`Đã thêm loại cây ${data.code}`);
      const list = await loadCategories();
      const created = list.find((c) => c.id === data.id);
      onCategoryChange(created ? { value: created.id, label: `${created.code} — ${created.name}` } : null);
      setNewCategoryOpen(false);
      setNewCategoryCode("");
      setNewCategoryName("");
    } finally {
      setCreatingCategory(false);
    }
  };

  const canSubmit = name.trim() && categoryOption && motherInputQuantity.trim() && transferWaitWeeks.trim() && photo1 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/trial-varieties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          plantCategoryId: categoryOption.value,
          motherInputQuantity: Number(motherInputQuantity),
          transferWaitWeeks: Number(transferWaitWeeks),
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
            <Combobox
              items={categoryOptions}
              value={categoryOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(val) => onCategoryChange(val as ComboOption | null)}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ mã/tên loại cây…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <button
              type="button"
              onClick={() => setNewCategoryOpen(true)}
              className="inline-flex items-center gap-1 text-xs text-primary-strong hover:underline mt-1"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Chưa có loại cây cần dùng? Thêm loại cây mới
            </button>
          </div>

          <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Thêm loại cây mới</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mã loại cây (2-3 chữ cái) <span className="text-destructive">*</span></Label>
                  <Input
                    value={newCategoryCode}
                    onChange={(e) => setNewCategoryCode(e.target.value)}
                    placeholder="VD: MT"
                    maxLength={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tên loại cây <span className="text-destructive">*</span></Label>
                  <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="VD: Trầu bà" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setNewCategoryOpen(false)}>Hủy</Button>
                  <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={creatingCategory} onClick={createCategory}>
                    {creatingCategory && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Thêm
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Số lượng mẫu mẹ đưa vào cấy <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={motherInputQuantity} onChange={(e) => setMotherInputQuantity(e.target.value)} placeholder="VD: 10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Thời gian cấy chuyển (tuần) <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={transferWaitWeeks} onChange={(e) => setTransferWaitWeeks(e.target.value)} placeholder="VD: 4" />
              {categoryOption && (
                <p className="text-xs text-text-muted">Mặc định theo Loại cây đã chọn — sửa lại được nếu cần.</p>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nguồn gốc</Label>
            <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="VD: Từ loại cây nào" />
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
          <p className="text-xs text-text-muted">Mã giống sẽ được hệ thống tự sinh theo Loại cây đã chọn (VD: AL999) sau khi tạo.</p>
          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Tạo giống mới
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
