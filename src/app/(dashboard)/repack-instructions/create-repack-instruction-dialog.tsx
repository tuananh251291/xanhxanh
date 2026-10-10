"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FINISHED_SPEC_LABELS, FINISHED_SPEC_BAG_SIZE } from "@/types";

type FinishedLot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  enteredAt: string;
  plantType: { code: string; name: string };
  shelf: {
    id: string;
    code: string;
    warehouse: { name: string };
    rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
  } | null;
};

type ComboOption = { value: string; label: string };
// comboKey = `${plantTypeCode}::${stageCode}` — trên 1 kệ lẻ xác định đúng 1 lô (1 kệ chỉ có đúng 1 lô
// ACTIVE/combo, xem placeRepackOutput merge-theo-cặp-này ở src/lib/repack-placement.ts); trên 1 Nhóm tuần
// ra rễ thì gộp MỌI lô cùng combo trên tất cả kệ thuộc Nhóm.
// sourceKey = id kệ lẻ (kệ chưa gán Nhóm tuần ra rễ) hoặc `group:<rotationGroupId>` — chọn 1 kệ đã thuộc
// Nhóm tuần ra rễ thì tự đổi đầu vào thành cả Nhóm đó, hiện tổng số lượng của Nhóm thay vì từng lô.
type Row = { key: number; sourceKey: string; comboKey: string; quantity: string; outputStageCode: string };

const GROUP_PREFIX = "group:";

const OUTPUT_STAGE_CODES = Object.keys(FINISHED_SPEC_LABELS) as (keyof typeof FINISHED_SPEC_LABELS)[];
const stageLabel = (code: string) => FINISHED_SPEC_LABELS[code as keyof typeof FINISHED_SPEC_LABELS] ?? code;
const bagSizeOf = (code: string) => FINISHED_SPEC_BAG_SIZE[code as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;

const emptyRow = (key: number): Row => ({ key, sourceKey: "",comboKey: "", quantity: "", outputStageCode: "" });

export default function CreateRepackInstructionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lots, setLots] = useState<FinishedLot[]>([]);
  const [notes, setNotes] = useState("");

  // Bắt đầu từ 1 vì dòng đầu tiên (key 0) đã gán sẵn trong state khởi tạo — chỉ tăng khi thêm dòng mới
  // (giống quy ước rowKeyRef ở stock-in-form.tsx), tránh trùng key khi xoá/thêm dòng liên tục.
  const rowKeyRef = useRef(1);
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/lots?roomType=PHONG_RA_RE&stage=THANH_PHAM&status=ACTIVE")
      .then((r) => r.json())
      .then((data: FinishedLot[]) => setLots(Array.isArray(data) ? data.filter((l) => l.shelf && l.quantity > 0) : []))
      .finally(() => setLoading(false));
  }, [open]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      rowKeyRef.current = 1;
      setRows([emptyRow(0)]);
      setNotes("");
    }
  };

  // Danh sách chọn gồm cả kệ lẻ lẫn Nhóm tuần ra rễ — kệ thuộc Nhóm vẫn hiện (gõ đúng mã kệ quen thuộc
  // như A03C09 vẫn tìm được) nhưng chọn vào sẽ tự quy về option của Nhóm (xem sourceKeyOfShelf).
  const sourceOptions: ComboOption[] = useMemo(() => {
    const groups = new Map<string, { name: string; order: number | null; shelfCodes: Set<string> }>();
    const shelves = new Map<string, ComboOption>();
    for (const l of lots) {
      if (!l.shelf) continue;
      const g = l.shelf.rotationGroup;
      if (g) {
        const entry = groups.get(g.id) ?? { name: g.name, order: g.rotationOrder, shelfCodes: new Set<string>() };
        entry.shelfCodes.add(l.shelf.code);
        groups.set(g.id, entry);
      }
      if (!shelves.has(l.shelf.id)) {
        shelves.set(l.shelf.id, {
          value: l.shelf.id,
          label: `${l.shelf.code} — ${l.shelf.warehouse.name}${g ? ` (thuộc ${g.name})` : ""}`,
        });
      }
    }
    const groupOptions = Array.from(groups.entries())
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .map(([id, g]) => ({
        value: `${GROUP_PREFIX}${id}`,
        label: `${g.name} — ${Array.from(g.shelfCodes).sort().join(", ")}`,
      }));
    return [...groupOptions, ...Array.from(shelves.values())];
  }, [lots]);

  const sourceKeyOfShelf = (shelfId: string): string => {
    const g = lots.find((l) => l.shelf?.id === shelfId)?.shelf?.rotationGroup;
    return g ? `${GROUP_PREFIX}${g.id}` : shelfId;
  };

  const lotsInSource = (sourceKey: string) =>
    sourceKey.startsWith(GROUP_PREFIX)
      ? lots.filter((l) => l.shelf?.rotationGroup?.id === sourceKey.slice(GROUP_PREFIX.length))
      : lots.filter((l) => l.shelf?.id === sourceKey);

  // "Gõ sẽ hiện đề xuất số cây trong kệ" — nhãn combobox tự kèm luôn số cây hiện có, để KY_THUAT thấy
  // ngay không cần tra thêm cột riêng lúc đang gõ tìm. Nhóm tuần ra rễ: gộp tổng mọi lô cùng mã cây +
  // quy cách trên các kệ của Nhóm thành 1 dòng thay vì hiện từng lô.
  const comboOptionsForSource = (sourceKey: string): ComboOption[] => {
    const map = new Map<string, { plantTypeCode: string; stageCode: string; quantity: number; count: number }>();
    for (const l of lotsInSource(sourceKey)) {
      const key = `${l.plantType.code}::${l.stageCode}`;
      const entry = map.get(key) ?? { plantTypeCode: l.plantType.code, stageCode: l.stageCode, quantity: 0, count: 0 };
      entry.quantity += l.quantity;
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([value, e]) => ({
      value,
      label: `${e.plantTypeCode} — ${stageLabel(e.stageCode)} (${e.quantity.toLocaleString("vi-VN")} cây${e.count > 1 ? ` · ${e.count} lô` : ""})`,
    }));
  };

  const sourceForRow = (row: Row): { stageCode: string; quantity: number; lots: FinishedLot[] } | null => {
    if (!row.sourceKey || !row.comboKey) return null;
    const [plantTypeCode, stageCode] = row.comboKey.split("::");
    const matched = lotsInSource(row.sourceKey).filter((l) => l.plantType.code === plantTypeCode && l.stageCode === stageCode);
    if (matched.length === 0) return null;
    return { stageCode, quantity: matched.reduce((sum, l) => sum + l.quantity, 0), lots: matched };
  };

  const updateRow = (key: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(rowKeyRef.current)]);
    rowKeyRef.current += 1;
  };
  const removeRow = (key: number) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));

  const onSubmit = async () => {
    type Payload = { sourceShelfId: string; sourceLotId: string; inputQuantity: number; outputStageCode: string; notes?: string };
    const payloads: Payload[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lot = sourceForRow(row);
      if (!lot) { toast.error(`Dòng ${i + 1}: chọn kệ + mã cây/quy cách`); return; }
      const qty = Number(row.quantity) || 0;
      const bagSize = bagSizeOf(lot.stageCode);
      if (qty <= 0) { toast.error(`Dòng ${i + 1}: nhập số lượng lấy ra`); return; }
      if (qty > lot.quantity) {
        toast.error(`Dòng ${i + 1}: số lượng lấy ra vượt quá tồn trên kệ (còn ${lot.quantity.toLocaleString("vi-VN")} cây)`);
        return;
      }
      if (qty % bagSize !== 0) {
        toast.error(`Dòng ${i + 1}: số lượng phải lấy nguyên túi (bội số của ${bagSize} cây/túi ${lot.stageCode})`);
        return;
      }
      if (!row.outputStageCode) { toast.error(`Dòng ${i + 1}: chọn quy cách đầu ra`); return; }
      // RepackInstruction vẫn là 1 chỉ định = 1 kệ + 1 lô nguồn — đầu vào là cả Nhóm tuần ra rễ thì chia số
      // lượng lấy ra lần lượt cho từng lô (lô nhập sớm nhất trước), mỗi phần là nguyên túi và không vượt tồn
      // của lô đó, mỗi phần thành 1 chỉ định riêng.
      const ordered = [...lot.lots].sort((a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime());
      let remaining = qty;
      for (const l of ordered) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Math.floor(l.quantity / bagSize) * bagSize);
        if (take <= 0) continue;
        payloads.push({
          sourceShelfId: l.shelf!.id, sourceLotId: l.id, inputQuantity: take,
          outputStageCode: row.outputStageCode, notes: notes.trim() || undefined,
        });
        remaining -= take;
      }
      if (remaining > 0) {
        toast.error(`Dòng ${i + 1}: các lô trong nhóm không đủ nguyên túi để lấy ${qty.toLocaleString("vi-VN")} cây — giảm số lượng`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Model RepackInstruction là bảng phẳng (1 chỉ định = đúng 1 kệ + 1 lô nguồn, xem prisma/schema.prisma)
      // — nhiều dòng trong form này tạo THÀNH NHIỀU chỉ định riêng, gọi POST tuần tự từng dòng (không có
      // API batch) — dừng lại và báo rõ dòng nào lỗi nếu giữa chừng thất bại, các dòng trước đó đã tạo vẫn
      // giữ nguyên (không rollback ngược — mỗi chỉ định độc lập, không cần atomic cả lô).
      const createdCodes: string[] = [];
      for (let i = 0; i < payloads.length; i++) {
        const res = await fetch("/api/repack-instructions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloads[i]),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(`Chỉ định ${i + 1}: ${json.message ?? "Có lỗi xảy ra"}`);
          if (createdCodes.length > 0) {
            toast.success(`Đã tạo thành công ${createdCodes.length} chỉ định trước đó: ${createdCodes.join(", ")}`);
            router.refresh();
          }
          return;
        }
        createdCodes.push(json.code);
      }
      toast.success(`Đã tạo ${createdCodes.length} chỉ định cấy xử lý: ${createdCodes.join(", ")}`);
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button className="bg-primary hover:bg-primary-hover" />}>
        <Plus className="w-4 h-4 mr-1.5" /> Tạo chỉ định cấy xử lý
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Tạo chỉ định cấy xử lý</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <div className="min-w-[920px] space-y-2">
                <div className="grid grid-cols-[1fr_1.5fr_8rem_9rem_8rem_8rem_2.5rem] gap-2 text-xs text-text-secondary font-medium px-1">
                  <span>Kệ đầu vào</span>
                  <span>Mã cây + quy cách</span>
                  <span>Số lượng trong kệ</span>
                  <span>Số lượng lấy ra xử lý</span>
                  <span>Quy cách đầu ra</span>
                  <span>Số lượng đầu ra</span>
                  <span />
                </div>
                {rows.map((row) => {
                  const lot = sourceForRow(row);
                  const qty = Number(row.quantity) || 0;
                  const rowComboOptions = comboOptionsForSource(row.sourceKey);
                  // Cho phép chọn cả quy cách trùng lô đầu vào (VD T01 -> T01) — đóng gói lại cùng quy
                  // cách vẫn hợp lệ (dồn/xếp lại túi lẻ), không chỉ dùng để đổi quy cách.
                  const outputOptions = OUTPUT_STAGE_CODES;
                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1fr_1.5fr_8rem_9rem_8rem_8rem_2.5rem] gap-2 items-center border border-divider rounded-lg p-2"
                    >
                      <Combobox
                        items={sourceOptions}
                        value={sourceOptions.find((o) => o.value === row.sourceKey) ?? null}
                        isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                        onValueChange={(v) => {
                          const picked = v ? (v as ComboOption).value : "";
                          const sourceKey = !picked || picked.startsWith(GROUP_PREFIX) ? picked : sourceKeyOfShelf(picked);
                          updateRow(row.key, { sourceKey, comboKey: "", quantity: "" });
                        }}
                      >
                        <ComboboxInputGroup className="w-full h-9">
                          <ComboboxInput className="text-xs" placeholder="Gõ mã kệ…" />
                          <ComboboxTrigger />
                        </ComboboxInputGroup>
                        <ComboboxContent>
                          <ComboboxEmpty>Không tìm thấy kệ</ComboboxEmpty>
                          <ComboboxList>
                            {(item: ComboOption) => <ComboboxItem key={item.value} value={item} className="text-xs">{item.label}</ComboboxItem>}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>

                      <Combobox
                        items={rowComboOptions}
                        value={rowComboOptions.find((o) => o.value === row.comboKey) ?? null}
                        isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                        onValueChange={(v) => updateRow(row.key, { comboKey: v ? (v as ComboOption).value : "", quantity: "" })}
                        disabled={!row.sourceKey}
                      >
                        <ComboboxInputGroup className="w-full h-9">
                          <ComboboxInput className="text-xs" placeholder={row.sourceKey ?"Gõ mã cây hoặc quy cách…" : "Chọn kệ trước"} />
                          <ComboboxTrigger />
                        </ComboboxInputGroup>
                        <ComboboxContent>
                          <ComboboxEmpty>Không có mã cây nào trên kệ này</ComboboxEmpty>
                          <ComboboxList>
                            {(item: ComboOption) => <ComboboxItem key={item.value} value={item} className="text-xs">{item.label}</ComboboxItem>}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>

                      <div className="text-sm text-foreground text-center">
                        {lot ? `${lot.quantity.toLocaleString("vi-VN")} cây` : "—"}
                      </div>

                      <Input
                        type="number" min={1} className="h-9 text-xs"
                        value={row.quantity}
                        disabled={!lot}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        placeholder={lot ? `Bội số ${bagSizeOf(lot.stageCode)}` : "—"}
                      />

                      <Select
                        items={outputOptions.map((c) => ({ value: c, label: FINISHED_SPEC_LABELS[c] }))}
                        value={row.outputStageCode || null}
                        onValueChange={(v) => updateRow(row.key, { outputStageCode: v as string })}
                      >
                        <SelectTrigger className="h-9 text-xs" disabled={!lot}><SelectValue placeholder="Chọn" /></SelectTrigger>
                        <SelectContent>
                          {outputOptions.map((c) => (
                            <SelectItem key={c} value={c}>{FINISHED_SPEC_LABELS[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="text-sm text-primary-strong font-medium text-center">
                        {qty > 0 ? `${qty.toLocaleString("vi-VN")} cây` : "—"}
                      </div>

                      <Button
                        type="button" variant="ghost" size="icon-sm" className="text-destructive hover:bg-danger-light"
                        disabled={rows.length <= 1}
                        onClick={() => removeRow(row.key)}
                        title="Xoá dòng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Thêm dòng
            </Button>

            <div className="space-y-1">
              <Label>Ghi chú</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú thêm (không bắt buộc)…" />
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary-hover"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Tạo {rows.length > 1 ? `${rows.length} chỉ định` : "chỉ định"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
