"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sprout, Loader2, Send, CheckCheck, Eraser } from "lucide-react";
import { toast } from "sonner";
import TransferReceipt from "../transfer-receipt";
import type { ScannedShelf, ShelfLot, CreatedTransfer } from "../types";
import type { RootingGroup } from "../rooting-groups";

type PickableShelf = { id: string; code: string; name: string; warehouseName: string; roomName: string };

// 1 dòng = 1 tổ hợp (loại cây, quy cách) gộp trên TOÀN Nhóm (không phân biệt kệ nào) — max = tổng tồn của
// tổ hợp đó trên mọi kệ trong Nhóm.
type AggregatedRow = { key: string; code: string; name: string; stageCode: string; max: number };

function computeAggregatedRows(group: RootingGroup): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const shelf of group.shelves) {
    for (const lot of shelf.lots) {
      const key = `${lot.plantType.id}::${lot.stageCode}`;
      const existing = map.get(key) ?? { key, code: lot.plantType.code, name: lot.plantType.name, stageCode: lot.stageCode, max: 0 };
      existing.max += lot.quantity;
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code) || a.stageCode.localeCompare(b.stageCode));
}

export default function EarlyHandoffForm({
  khaDungRoomId, staffName, pickableShelves, rootingGroups,
}: {
  khaDungRoomId: string;
  staffName: string;
  pickableShelves: PickableShelf[];
  rootingGroups: RootingGroup[];
}) {
  const router = useRouter();
  const [previewShelfId, setPreviewShelfId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<CreatedTransfer | null>(null);

  const previewGroup = useMemo(
    () => rootingGroups.find((g) => g.shelves.some((s) => s.id === previewShelfId)) ?? null,
    [previewShelfId, rootingGroups]
  );

  const aggregatedRows = useMemo(() => (previewGroup ? computeAggregatedRows(previewGroup) : []), [previewGroup]);

  const fillQuantities = (rows: AggregatedRow[], toMax: boolean) => {
    const next: Record<string, number> = {};
    for (const row of rows) next[row.key] = toMax ? row.max : 0;
    setQuantities(next);
  };

  const pickShelf = (shelfId: string) => {
    setPreviewShelfId(shelfId);
    const group = rootingGroups.find((g) => g.shelves.some((s) => s.id === shelfId));
    if (!group) {
      toast.error("Kệ này chưa thuộc Nhóm tuần ra rễ nào");
      setQuantities({});
      return;
    }
    // Mặc định điền sẵn = tồn tối đa (giống mặc định "chọn tất cả" trước đây) — NV sửa xuống số ít hơn
    // cho loại cây/quy cách nào muốn giữ lại (chưa đạt xuất), không bắt buộc nhập lại từ đầu.
    fillQuantities(computeAggregatedRows(group), true);
  };

  const getQty = (key: string) => quantities[key] ?? 0;

  const setQty = (key: string, raw: string, max: number) => {
    const parsed = Math.floor(Number(raw));
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
    setQuantities((prev) => ({ ...prev, [key]: clamped }));
  };

  const submit = async () => {
    if (!previewGroup) return;
    // Số muốn bàn giao NV nhập cho từng (loại cây, quy cách) có thể nhỏ hơn tổng tồn của cả Nhóm (bàn
    // giao sớm 1 phần) — phân bổ vào lô CŨ NHẤT trước (FIFO theo enteredAt), xét trên TẤT CẢ các kệ trong
    // Nhóm có tổ hợp đó (không giới hạn theo 1 kệ), giữ đúng nguyên tắc ưu tiên lô cũ như mọi nơi khác
    // trong hệ thống. Sau khi phân bổ xong mới gom lại theo từng kệ để in phiếu (1 kệ có thể góp mặt
    // trong nhiều dòng nếu có nhiều loại cây/quy cách).
    const allLotsInGroup = previewGroup.shelves.flatMap((shelf) =>
      shelf.lots.map((lot) => ({ ...lot, shelf }))
    );

    const shelfMap = new Map<string, ScannedShelf>();
    for (const row of aggregatedRows) {
      let remaining = getQty(row.key);
      if (remaining <= 0) continue;
      const lotsForRow = allLotsInGroup
        .filter((l) => `${l.plantType.id}::${l.stageCode}` === row.key)
        .slice()
        .sort((a, b) => new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime());
      for (const lot of lotsForRow) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantity, remaining);
        if (take <= 0) continue;
        remaining -= take;
        const shelf = shelfMap.get(lot.shelf.id) ?? { id: lot.shelf.id, code: lot.shelf.code, name: lot.shelf.name, roomId: lot.shelf.roomId, lots: [] as ShelfLot[] };
        shelf.lots.push({ id: lot.id, code: lot.code, quantity: take, stageCode: lot.stageCode, plantType: lot.plantType });
        shelfMap.set(lot.shelf.id, shelf);
      }
    }

    const shelvesForReceipt = Array.from(shelfMap.values());
    const allItems = shelvesForReceipt.flatMap((s) => s.lots.map((l) => ({ lotId: l.id, quantity: l.quantity })));
    if (allItems.length === 0) {
      toast.error("Chưa nhập số muốn bàn giao nào");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toRoomId: khaDungRoomId,
          notes: `Bàn giao sớm (${previewGroup.groupName}) — Giàn kệ: ${shelvesForReceipt.map((s) => s.code).join(", ")}`,
          items: allItems,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã tạo phiếu bàn giao thành phẩm");
      setCreatedTransfer({ id: json.id, code: json.code, transferredAt: json.transferredAt, shelves: shelvesForReceipt });
    } finally {
      setSubmitting(false);
    }
  };

  if (createdTransfer) {
    return (
      <TransferReceipt
        transfer={createdTransfer}
        staffName={staffName}
        onCreateNew={() => router.push("/transfers/finished")}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/transfers/finished")} title="Quay lại">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sprout className="w-6 h-6 text-primary-strong" /> Bàn giao sớm theo Nhóm tuần ra rễ
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Chọn 1 kệ bất kỳ để xem cả Nhóm tuần ra rễ chứa kệ đó, rồi nhập số muốn bàn giao trước cho từng loại cây/quy cách
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Select
            items={pickableShelves.map((s) => ({ value: s.id, label: `${s.code} — ${s.warehouseName} · ${s.roomName}` }))}
            value={previewShelfId}
            onValueChange={(v) => pickShelf(v as string)}
          >
            <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Chọn 1 kệ để xem Nhóm tuần ra rễ..." /></SelectTrigger>
            <SelectContent>
              {pickableShelves.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.code} — {s.warehouseName} · {s.roomName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {previewGroup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{previewGroup.groupName}</CardTitle>
            <p className="text-xs text-text-secondary mt-0.5">
              {previewGroup.roomName} ({previewGroup.warehouseName}) · {previewGroup.shelves.length} kệ
              {!previewGroup.isDue && " · Chưa đến hạn bàn giao theo lịch"}
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {previewGroup.shelves.map((shelf) => (
              <Badge key={shelf.id} variant="secondary" className="font-mono">{shelf.code}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {previewGroup && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Số lượng theo loại cây / quy cách</CardTitle>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => fillQuantities(aggregatedRows, true)}>
                  <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Đặt tất cả về tối đa
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => fillQuantities(aggregatedRows, false)}>
                  <Eraser className="w-3.5 h-3.5 mr-1.5" /> Đặt tất cả về 0
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {aggregatedRows.length === 0 ? (
              <p className="px-6 py-10 text-center text-text-muted">Nhóm này chưa có thành phẩm nào</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
                      <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Số muốn bàn giao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedRows.map((row) => (
                      <tr key={row.key} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-text-secondary mr-2">{row.code}</span>
                          {row.name}
                        </td>
                        <td className="px-4 py-2.5">{row.stageCode}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{row.max.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="number"
                            min={0}
                            max={row.max}
                            value={getQty(row.key)}
                            onChange={(e) => setQty(row.key, e.target.value, row.max)}
                            className="w-24 h-8"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {previewGroup && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => router.push("/transfers/finished")} disabled={submitting}>
            Hủy, quay lại
          </Button>
          <Button className="flex-1 bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Xác nhận bàn giao
          </Button>
        </div>
      )}
    </div>
  );
}
