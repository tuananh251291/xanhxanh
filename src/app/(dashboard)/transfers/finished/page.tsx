"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Loader2, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

type Lot = {
  id: string;
  code: string;
  quantity: number;
  stage: string;
  plantType: { name: string; code: string };
  shelf?: { code: string; warehouse: { name: string } } | null;
};
type Warehouse = { id: string; code: string; name: string; type: string };

export default function TransferFinishedPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ lotId: string; quantity: number }[]>([]);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [lotRes, wRes] = await Promise.all([
      fetch("/api/lots?warehouseType=KHO_SANG&stage=THANH_PHAM&status=ACTIVE"),
      fetch("/api/warehouses?type=KHO_THANH_PHAM"),
    ]);
    const [lotData, wData] = await Promise.all([lotRes.json(), wRes.json()]);
    setLots(Array.isArray(lotData) ? lotData : []);
    setWarehouses(Array.isArray(wData) ? wData : []);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const addItem = () => setSelectedItems((prev) => [...prev, { lotId: "", quantity: 0 }]);
  const removeItem = (idx: number) => setSelectedItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!toWarehouseId) { toast.error("Chọn kho thành phẩm đích"); return; }
    const validItems = selectedItems.filter((i) => i.lotId && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Thêm ít nhất 1 lô"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toWarehouseId, notes, items: validItems }),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success("Tạo phiếu bàn giao thành phẩm thành công");
      setSelectedItems([]); setToWarehouseId(""); setNotes("");
      loadData();
    } finally { setLoading(false); }
  };

  const getLot = (id: string) => lots.find((l) => l.id === id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6 text-green-600" /> Bàn giao thành phẩm
        </h1>
        <p className="text-gray-500 text-sm mt-1">Chuyển thành phẩm từ kho sáng sang kho thành phẩm</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Kho đích</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Kho thành phẩm <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => setToWarehouseId(v as string)}>
              <SelectTrigger><SelectValue placeholder="Chọn kho TP" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <CardTitle className="text-base">Lô thành phẩm bàn giao</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> Thêm lô
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lots.length === 0 && <p className="text-sm text-gray-400">Không có thành phẩm trong kho sáng</p>}
          {selectedItems.length === 0 && lots.length > 0 && (
            <p className="text-sm text-gray-400">Nhấn &quot;Thêm lô&quot; để chọn lô thành phẩm</p>
          )}
          {selectedItems.map((item, idx) => {
            const lot = getLot(item.lotId);
            return (
              <div key={idx} className="flex items-center gap-2">
                <Select onValueChange={(v) => setSelectedItems((prev) => prev.map((it, i) => i === idx ? { ...it, lotId: v as string } : it))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn lô TP" />
                  </SelectTrigger>
                  <SelectContent>
                    {lots.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.code} — {l.plantType.name} ({l.quantity.toLocaleString("vi-VN")})
                        {l.shelf ? ` · ${l.shelf.code}` : ""}
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
                {lot && <span className="text-xs text-gray-400">/{lot.quantity.toLocaleString("vi-VN")}</span>}
                <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Button
        className="w-full bg-green-600 hover:bg-green-700"
        onClick={submit}
        disabled={loading || selectedItems.length === 0}
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
        Tạo phiếu bàn giao thành phẩm
      </Button>
    </div>
  );
}
