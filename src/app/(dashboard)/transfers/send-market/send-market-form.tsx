"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Loader2, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

type Lot = {
  id: string;
  code: string;
  quantity: number;
  stage: string;
  stageCode: string;
  plantType: { name: string; code: string };
};
type Warehouse = { id: string; code: string; name: string };

export default function SendMarketForm() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [marketWarehouses, setMarketWarehouses] = useState<Warehouse[]>([]);
  const [sourceRoomId, setSourceRoomId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ lotId: string; quantity: number }[]>([]);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingLots, setLoadingLots] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Nguồn LUÔN là Phòng đạt tiêu chuẩn của Kho thành phẩm — hàng đã đạt chuẩn, sẵn sàng gửi ra thị
  // trường, không cho chọn phòng khác (Phòng theo dõi/hàn túi chưa phải hàng hoàn thiện).
  const loadData = useCallback(async () => {
    setLoadingLots(true);
    try {
      const [whRes, marketRes] = await Promise.all([
        fetch("/api/warehouses?type=THANH_PHAM"),
        fetch("/api/warehouses?type=THI_TRUONG"),
      ]);
      const [whData, marketData] = await Promise.all([whRes.json(), marketRes.json()]);
      setMarketWarehouses(Array.isArray(marketData) ? marketData : []);

      const ktp = Array.isArray(whData) ? whData[0] : null;
      if (!ktp) return;
      const roomRes = await fetch(`/api/rooms?warehouseId=${ktp.id}&type=PHONG_DAT_TIEU_CHUAN`);
      const roomData = await roomRes.json();
      const room = Array.isArray(roomData) ? roomData[0] : null;
      if (!room) return;
      setSourceRoomId(room.id);

      const lotRes = await fetch(`/api/lots?roomId=${room.id}&status=ACTIVE`);
      const lotData = await lotRes.json();
      setLots(Array.isArray(lotData) ? lotData : []);
    } finally {
      setLoadingLots(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const addItem = () => setSelectedItems((prev) => [...prev, { lotId: "", quantity: 0 }]);
  const removeItem = (idx: number) => setSelectedItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!toWarehouseId) { toast.error("Chọn Kho thị trường đích"); return; }
    const validItems = selectedItems.filter((i) => i.lotId && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Thêm ít nhất 1 lô"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toWarehouseId, notes: notes || undefined, items: validItems }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã gửi phiếu hàng tới Kho thị trường");
      setSelectedItems([]); setToWarehouseId(""); setNotes("");
      if (sourceRoomId) {
        const lotRes = await fetch(`/api/lots?roomId=${sourceRoomId}&status=ACTIVE`);
        const lotData = await lotRes.json();
        setLots(Array.isArray(lotData) ? lotData : []);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getLot = (id: string) => lots.find((l) => l.id === id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Globe className="w-6 h-6 text-primary-strong" />
          Gửi hàng Kho thị trường
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Gửi hàng từ Phòng đạt tiêu chuẩn sang 1 Kho thị trường — Đối tác vận hành sẽ nhập số lượng thực nhận khi xác nhận.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Kho thị trường đích</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Kho thị trường <span className="text-destructive">*</span></Label>
            {marketWarehouses.length === 0 ? (
              <p className="text-sm text-text-muted">Chưa có Kho thị trường nào — liên hệ Admin cấp cao tạo kho.</p>
            ) : (
              <Select
                items={marketWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
                value={toWarehouseId || null}
                onValueChange={(v) => setToWarehouseId(v as string)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn Kho thị trường" /></SelectTrigger>
                <SelectContent>
                  {marketWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lô hàng gửi đi</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={loadingLots || lots.length === 0}>
              <Plus className="w-4 h-4 mr-1" /> Thêm lô
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingLots ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : lots.length === 0 ? (
            <p className="text-sm text-text-muted">Phòng đạt tiêu chuẩn hiện không có lô nào.</p>
          ) : selectedItems.length === 0 ? (
            <p className="text-sm text-text-muted">Chưa chọn lô nào</p>
          ) : (
            selectedItems.map((item, idx) => {
              const lot = getLot(item.lotId);
              return (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <Select
                    items={lots.map((l) => ({
                      value: l.id,
                      label: `${l.code} — ${l.plantType.name} (${l.stageCode}, ${l.quantity.toLocaleString("vi-VN")} cây)`,
                    }))}
                    value={item.lotId || null}
                    onValueChange={(v) => setSelectedItems((prev) => prev.map((it, i) => i === idx ? { ...it, lotId: v as string } : it))}
                  >
                    <SelectTrigger className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <SelectValue placeholder="Chọn lô" />
                    </SelectTrigger>
                    <SelectContent>
                      {lots.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.code} — {l.plantType.name} ({l.stageCode}, {l.quantity.toLocaleString("vi-VN")} cây)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={lot?.quantity}
                    placeholder="SL"
                    className="w-24"
                    value={item.quantity || ""}
                    onChange={(e) => setSelectedItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 0 } : it))}
                  />
                  {lot && <span className="text-xs text-text-muted">/{lot.quantity} cây</span>}
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full bg-primary hover:bg-primary-hover"
        onClick={submit}
        disabled={submitting || selectedItems.length === 0}
      >
        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
        Gửi hàng
      </Button>
    </div>
  );
}
