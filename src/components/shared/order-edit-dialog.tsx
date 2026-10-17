"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxInputGroup, ComboboxItem, ComboboxList, ComboboxTrigger,
} from "@/components/ui/combobox";
import { Loader2, Lock, PenLine, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ALL_FINISHED_STAGE_CODES } from "@/types";

type ComboOption = { value: string; label: string };
type PlantTypeOption = { id: string; code: string; name: string };
type EditData = {
  order: { id: string; code: string; status: string };
  locked: { id: string; plantCode: string; plantName: string; stageCode: string; quantity: number; reason: string }[];
  processing: { id: string; plantCode: string; plantName: string; stageCode: string; quantity: number; prCode: string | null }[];
  regular: { plantTypeId: string; plantCode: string; plantName: string; stageCode: string; quantity: number; picked: number }[];
};
type Row = { key: string; plantTypeId: string; stageCode: string; quantity: string; original: number; picked: number };

const STAGE_OPTIONS = ALL_FINISHED_STAGE_CODES.map((s) => ({ value: s, label: s }));
let rowSeq = 0;

// Nút + hộp thoại "Sửa đơn" của QL Kho thành phẩm / Admin cấp cao — đơn chưa xuất (HELD/CONFIRMED). Xem quy
// tắc ở src/lib/order-edit.ts: dòng khoá chỉ xem, dòng xử lý cây chỉ giữ/xoá, dòng thường sửa tự do (tăng phải
// đủ tồn đạt tiêu chuẩn đúng quy cách).
export default function OrderEditDialog({ orderId, orderCode, plantTypes }: { orderId: string; orderCode: string; plantTypes: PlantTypeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<EditData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);

  const plantOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/items`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); setOpen(false); return; }
      setData(json);
      setRows((json as EditData).regular.map((r) => ({
        key: `r${++rowSeq}`, plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: String(r.quantity), original: r.quantity, picked: r.picked,
      })));
      setRemoveIds([]);
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { key: `r${++rowSeq}`, plantTypeId: "", stageCode: "T01", quantity: "", original: 0, picked: 0 }]);
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const save = async () => {
    const lines = [];
    for (const r of rows) {
      if (!r.plantTypeId) { toast.error("Có dòng chưa chọn mã cây"); return; }
      const q = Number(r.quantity);
      if (!Number.isInteger(q) || q <= 0) { toast.error("Số lượng phải là số nguyên lớn hơn 0 (muốn bỏ dòng thì bấm xoá)"); return; }
      lines.push({ plantTypeId: r.plantTypeId, stageCode: r.stageCode, quantity: q });
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, removeItemIds: removeIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã sửa đơn ${orderCode} — đã báo NV bán hàng`);
      if (Array.isArray(json.pickWarnings) && json.pickWarnings.length > 0) {
        toast.warning("Nhặt dư — cần trả cây về vị trí", { description: json.pickWarnings.join(" · "), duration: 15000 });
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={openDialog}>
        <PenLine className="w-3.5 h-3.5 mr-1.5" /> Sửa đơn
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sửa đơn {orderCode}</DialogTitle></DialogHeader>
          {loading || !data ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-xs text-text-secondary bg-info-light rounded-lg p-2">
                Giảm số lượng không cần cộng tồn (nhặt hàng chưa trừ tồn thực) — chỉ cần NV trả cây dư về vị trí. Tăng/thêm phải đủ tồn đạt tiêu chuẩn
                đúng quy cách (không tự sinh yêu cầu tách túi). NV bán hàng sẽ được báo nội dung sửa.
              </p>

              {data.locked.length > 0 && (
                <div className="space-y-1">
                  <p className="font-bold text-foreground">Dòng đã khoá (không sửa được)</p>
                  {data.locked.map((l) => (
                    <p key={l.id} className="flex items-center gap-2 text-text-secondary">
                      <Lock className="w-3.5 h-3.5 shrink-0" /> {l.plantCode} {l.stageCode} · {l.quantity.toLocaleString("vi-VN")} cây — {l.reason}
                    </p>
                  ))}
                </div>
              )}

              {data.processing.length > 0 && (
                <div className="space-y-1">
                  <p className="font-bold text-foreground">Dòng xử lý cây (chỉ giữ hoặc xoá)</p>
                  {data.processing.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={removeIds.includes(p.id)}
                        onCheckedChange={(v) => setRemoveIds((prev) => (v ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                      />
                      <span className={removeIds.includes(p.id) ? "line-through text-text-muted" : "text-foreground"}>
                        Xoá {p.plantCode} {p.stageCode} · {p.quantity.toLocaleString("vi-VN")} cây{p.prCode ? ` (yêu cầu xử lý ${p.prCode} + đơn môi trường sẽ bị huỷ)` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto border border-divider rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                      <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Số lượng</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-4 text-text-muted">Không còn dòng thường nào</td></tr>
                    )}
                    {rows.map((r) => {
                      const q = Number(r.quantity) || 0;
                      const over = r.picked - q;
                      return (
                        <tr key={r.key} className="border-b last:border-0 align-top">
                          <td className="px-3 py-1.5 min-w-56">
                            {r.original > 0 ? (
                              <p className="py-2 font-mono">{plantOptions.find((o) => o.value === r.plantTypeId)?.label ?? r.plantTypeId}</p>
                            ) : (
                              <Combobox
                                items={plantOptions}
                                value={plantOptions.find((o) => o.value === r.plantTypeId) ?? null}
                                isItemEqualToValue={(a, b) => a.value === b.value}
                                onValueChange={(v) => updateRow(r.key, { plantTypeId: v?.value ?? "" })}
                              >
                                <ComboboxInputGroup className="h-9">
                                  <ComboboxInput className="text-sm" placeholder="Gõ mã hoặc tên cây…" />
                                  <ComboboxTrigger />
                                </ComboboxInputGroup>
                                <ComboboxContent>
                                  <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                                  <ComboboxList>
                                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item} className="text-sm">{item.label}</ComboboxItem>}
                                  </ComboboxList>
                                </ComboboxContent>
                              </Combobox>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.original > 0 ? (
                              <p className="py-2 font-medium">{r.stageCode}</p>
                            ) : (
                              <Select items={STAGE_OPTIONS} value={r.stageCode} onValueChange={(v) => updateRow(r.key, { stageCode: v as string })}>
                                <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {STAGE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <Input type="number" min={1} className="h-9 w-28" value={r.quantity} placeholder="0 cây" onChange={(e) => updateRow(r.key, { quantity: e.target.value })} />
                            {r.original > 0 && q !== r.original && (
                              <p className="text-xs text-text-muted pt-0.5">Trước: {r.original.toLocaleString("vi-VN")}</p>
                            )}
                            {over > 0 && (
                              <p className="text-xs text-warning-foreground pt-0.5 flex items-center gap-1">
                                <TriangleAlert className="w-3 h-3" /> Đã nhặt {r.picked.toLocaleString("vi-VN")} — dư {over.toLocaleString("vi-VN")}, cần trả lại
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(r.key)} title="Xoá dòng">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-text-muted">Đổi quy cách = xoá dòng cũ rồi thêm dòng mới với quy cách mới.</p>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm mã cây
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Huỷ</Button>
            <Button type="button" className="bg-primary hover:bg-primary-hover" onClick={save} disabled={saving || loading || !data}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
