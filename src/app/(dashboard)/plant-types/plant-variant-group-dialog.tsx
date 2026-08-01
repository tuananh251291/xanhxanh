"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Pencil, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type PlantType = { id: string; code: string; name: string };
type VariantGroup = { id: string; name: string; members: PlantType[] };
type ComboOption = { value: string; label: string };

// Quản lý nhóm biến thể (đột biến) — 1 mã cây thuộc ĐÚNG 1 nhóm, xem PlantType.variantGroupId. Chỉ mã
// cây CHƯA thuộc nhóm nào khác mới chọn được (trừ chính các mã đang thuộc nhóm đang sửa).
export default function PlantVariantGroupDialog({
  allPlantTypes, group, otherGroupedIds,
}: {
  allPlantTypes: PlantType[];
  group?: VariantGroup;
  otherGroupedIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(group?.members.map((m) => m.id) ?? []));
  const router = useRouter();
  const isEdit = !!group;

  const addMember = (id: string) => {
    setSelectedIds((prev) => new Set(prev).add(id));
  };
  const removeMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Chỉ mã cây CHƯA thuộc nhóm nào khác và CHƯA được chọn mới hiện trong gợi ý tìm — chọn xong tự thêm
  // vào danh sách bên dưới rồi trả ô tìm về rỗng, gõ tiếp được luôn cho mã kế tiếp.
  const searchOptions: ComboOption[] = useMemo(
    () =>
      allPlantTypes
        .filter((p) => !selectedIds.has(p.id) && !otherGroupedIds.has(p.id))
        .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
    [allPlantTypes, selectedIds, otherGroupedIds]
  );
  const selectedMembers = useMemo(
    () => allPlantTypes.filter((p) => selectedIds.has(p.id)),
    [allPlantTypes, selectedIds]
  );

  const onSubmit = async () => {
    if (name.trim().length < 2) { toast.error("Nhập tên nhóm (tối thiểu 2 ký tự)"); return; }
    if (selectedIds.size < 2) { toast.error("Chọn ít nhất 2 mã cây (mã gốc + ít nhất 1 biến thể)"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/plant-variant-groups", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: group!.id } : {}),
          name: name.trim(),
          memberPlantTypeIds: Array.from(selectedIds),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(isEdit ? "Cập nhật nhóm biến thể thành công" : "Thêm nhóm biến thể thành công");
      setOpen(false);
      router.refresh();
    } finally { setLoading(false); }
  };

  // Dialog không unmount giữa các lần đóng/mở (chỉ toggle `open`) — state cũ (tên/mã đã chọn) sẽ còn
  // nguyên nếu không reset. Reset lại đúng lúc MỞ (không phải lúc đóng) để luôn phản ánh đúng props hiện
  // tại — quan trọng với dialog Sửa vì `group` có thể đã đổi (VD router.refresh() sau khi sửa nhóm khác).
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setName(group?.name ?? "");
      setSelectedIds(new Set(group?.members.map((m) => m.id) ?? []));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button className="bg-primary hover:bg-primary-hover" />}>
        {isEdit
          ? <><Pencil className="w-4 h-4 mr-2" />Chỉnh sửa</>
          : <><Plus className="w-4 h-4 mr-2" />Thêm nhóm biến thể</>
        }
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Sửa nhóm biến thể "${group.name}"` : "Thêm nhóm biến thể mới"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Tên nhóm</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nhóm đột biến MT047" />
          </div>
          <div className="space-y-1">
            <Label>Các mã cây trong nhóm (gồm cả mã gốc dùng khi tạo chỉ định)</Label>
            <Combobox
              items={searchOptions}
              value={null}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => { if (v) addMember((v as ComboOption).value); }}
            >
              <ComboboxInputGroup className="w-full h-11 md:h-8">
                <ComboboxInput placeholder="Gõ mã hoặc tên cây để thêm…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy mã cây phù hợp</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>

            {selectedMembers.length === 0 ? (
              <p className="text-sm text-text-muted py-2">Chưa chọn mã cây nào</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-2">
                {selectedMembers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-sm bg-primary-light text-primary-strong"
                  >
                    <span className="font-mono font-medium">{p.code}</span>
                    <span className="text-primary-strong/80">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => removeMember(p.id)}
                      className="rounded-full p-0.5 hover:bg-primary/20"
                      aria-label={`Xoá ${p.code} khỏi nhóm`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading} onClick={onSubmit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Cập nhật" : "Thêm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
