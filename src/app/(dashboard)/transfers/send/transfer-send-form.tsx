"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageOpen, Loader2, Plus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@prisma/client";

type Lot = {
  id: string;
  code: string;
  quantity: number;
  stage: string;
  plantType: { name: string; code: string };
  shelf?: { code: string; warehouse: { name: string } } | null;
};
type Room = { id: string; code: string; name: string; type: string; warehouse: { id: string; name: string } };
type User = { id: string; name: string; role: string };

export default function TransferSendForm({ role }: { role: UserRole }) {
  const isKhoThanhPham = role === "KHO_THANH_PHAM";

  const [lots, setLots] = useState<Lot[]>([]);
  const [destRooms, setDestRooms] = useState<Room[]>([]);
  const [sourceRooms, setSourceRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ lotId: string; quantity: number }[]>([]);
  const [fromRoomId, setFromRoomId] = useState("");
  const [toRoomId, setToRoomId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLots = useCallback(async (roomId: string) => {
    const res = await fetch(
      isKhoThanhPham
        ? `/api/lots?roomId=${roomId}&status=ACTIVE`
        : "/api/lots?roomType=PHONG_SANG&stage=MAU_ME&status=ACTIVE"
    );
    const data = await res.json();
    setLots(Array.isArray(data) ? data : []);
  }, [isKhoThanhPham]);

  const loadData = useCallback(async () => {
    if (isKhoThanhPham) {
      const whRes = await fetch("/api/warehouses?type=THANH_PHAM");
      const whData = await whRes.json();
      const ktp = Array.isArray(whData) ? whData[0] : null;
      if (ktp) {
        const rRes = await fetch(`/api/rooms?warehouseId=${ktp.id}`);
        const rData = await rRes.json();
        setSourceRooms(Array.isArray(rData) ? rData : []);
        setDestRooms(Array.isArray(rData) ? rData : []);
      }
    } else {
      const [rRes, uRes] = await Promise.all([
        fetch("/api/rooms?type=PHONG_TOI"),
        fetch("/api/users"),
      ]);
      const [rData, uData] = await Promise.all([rRes.json(), uRes.json()]);
      setDestRooms(Array.isArray(rData) ? rData : []);
      setUsers((Array.isArray(uData) ? uData : []).filter((u: User) => u.role === "CAY_MO"));
      loadLots("");
    }
  }, [isKhoThanhPham, loadLots]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (isKhoThanhPham && fromRoomId) loadLots(fromRoomId);
  }, [isKhoThanhPham, fromRoomId, loadLots]);

  const addItem = () => setSelectedItems((prev) => [...prev, { lotId: "", quantity: 0 }]);
  const removeItem = (idx: number) => setSelectedItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!toRoomId) { toast.error("Chọn phòng đích"); return; }
    const validItems = selectedItems.filter((i) => i.lotId && i.quantity > 0);
    if (validItems.length === 0) { toast.error("Thêm ít nhất 1 lô"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toRoomId, toUserId: toUserId || undefined, notes, items: validItems }),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success("Tạo phiếu bàn giao thành công");
      setSelectedItems([]); setToRoomId(""); setToUserId(""); setNotes("");
      if (isKhoThanhPham && fromRoomId) loadLots(fromRoomId); else loadLots("");
    } finally { setLoading(false); }
  };

  const getLot = (id: string) => lots.find((l) => l.id === id);
  const roomLabel = (r: Room) => `${r.warehouse.name} — ${r.name}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PackageOpen className="w-6 h-6 text-indigo-600" />
          {isKhoThanhPham ? "Luân chuyển giữa các phòng" : "Bàn giao mẫu mẹ"}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {isKhoThanhPham
            ? "Chuyển hàng hóa tự do giữa các phòng trong kho thành phẩm"
            : "Chuyển mẫu mẹ từ kho sáng sang phòng tối cho NV cấy"}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{isKhoThanhPham ? "Nguồn & đích" : "Điểm đến"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isKhoThanhPham && (
            <div className="space-y-1">
              <Label>Phòng nguồn <span className="text-red-500">*</span></Label>
              <Select onValueChange={(v) => { setFromRoomId(v as string); setSelectedItems([]); }}>
                <SelectTrigger><SelectValue placeholder="Chọn phòng nguồn" /></SelectTrigger>
                <SelectContent>
                  {sourceRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{roomLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Phòng đích <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => setToRoomId(v as string)}>
              <SelectTrigger><SelectValue placeholder="Chọn phòng đích" /></SelectTrigger>
              <SelectContent>
                {destRooms.filter((r) => r.id !== fromRoomId).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{roomLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isKhoThanhPham && (
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
          )}
          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lô hàng bàn giao</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={isKhoThanhPham && !fromRoomId}>
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
                      <SelectValue placeholder="Chọn lô" />
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
        Tạo phiếu bàn giao
      </Button>
    </div>
  );
}
