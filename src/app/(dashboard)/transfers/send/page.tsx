"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageOpen, Loader2, Plus, Trash2, Send } from "lucide-react";
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
type User = { id: string; name: string; role: string };

export default function TransferSendPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ lotId: string; quantity: number }[]>([]);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [lotRes, wRes, uRes] = await Promise.all([
      fetch("/api/lots?warehouseType=KHO_SANG&stage=MAU_ME&status=ACTIVE"),
      fetch("/api/warehouses"),
      fetch("/api/users"),
    ]);
    const [lotData, wData, uData] = await Promise.all([lotRes.json(), wRes.json(), uRes.json()]);
    setLots(Array.isArray(lotData) ? lotData : []);
    setWarehouses(Array.isArray(wData) ? wData : []);
    setUsers((Array.isArray(uData) ? uData : []).filter((u: User) => u.role === "CAY_MO"));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const addItem = () => setSelectedItems((prev) => [...prev, { lotId: "", quantity: 0 }]);
  const removeItem = (idx: number) => setSelectedItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!toWarehouseId) { toast.error("Chọn kho đích"); return; }
    const validItems = selectedItems.filter((i) => i.lotId && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Thêm ít nhất 1 lô"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toWarehouseId, toUserId: toUserId || undefined, notes, items: validItems }),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success("Tạo phiếu bàn giao thành công");
      setSelectedItems([]); setToWarehouseId(""); setToUserId(""); setNotes("");
      loadData();
    } finally { setLoading(false); }
  };

  const getLot = (id: string) => lots.find((l) => l.id === id);
  const phongToiWarehouses = warehouses.filter((w) => w.type === "PHONG_TOI");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PackageOpen className="w-6 h-6 text-indigo-600" /> Bàn giao mẫu mẹ
        </h1>
        <p className="text-gray-500 text-sm mt-1">Chuyển mẫu mẹ từ kho sáng sang phòng tối cho NV cấy</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Điểm đến</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Kho đích (phòng tối) <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => setToWarehouseId(v as string)}>
              <SelectTrigger><SelectValue placeholder="Chọn phòng tối" /></SelectTrigger>
              <SelectContent>
                {phongToiWarehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Nhân viên cấy nhận</Label>
            <Select onValueChange={(v) => setToUserId(v as string)}>
              <SelectTrigger><SelectValue placeholder="Chọn NV (tuỳ chọn)" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
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
            <CardTitle className="text-base">Lô mẫu mẹ bàn giao</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> Thêm lô
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedItems.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa chọn lô nào</p>
          ) : (
            selectedItems.map((item, idx) => {
              const lot = getLot(item.lotId);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <Select onValueChange={(v) => setSelectedItems((prev) => prev.map((it, i) => i === idx ? { ...it, lotId: v as string } : it))}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Chọn lô MM" />
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
                  {lot && <span className="text-xs text-gray-400">/{lot.quantity}</span>}
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full bg-indigo-600 hover:bg-indigo-700"
        onClick={submit}
        disabled={loading || selectedItems.length === 0}
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
        Tạo phiếu bàn giao mẫu mẹ
      </Button>
    </div>
  );
}
