"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Layers, Loader2, Plus, Pencil, Trash2, Check, X, Settings2 } from "lucide-react";
import { toast } from "sonner";

type GroupRoom = { roomId: string; roomName: string; warehouseId: string; warehouseName: string; blocks: string[] };
type Group = { id: string; name: string; type: string | null; shelfCount: number; rooms: GroupRoom[] };

type ShelfLite = { id: string; block: string | null; group: { id: string; name: string } | null };
type RoomLite = { id: string; name: string; shelves: ShelfLite[] };
type WarehouseLite = { id: string; name: string; rooms: RoomLite[] };

export default function ShelfGroupBoard() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("");

  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);
  const [pickerWarehouseId, setPickerWarehouseId] = useState<string | null>(null);
  const [pickerRoomId, setPickerRoomId] = useState<string | null>(null);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, wRes] = await Promise.all([
        fetch("/api/shelf-groups"),
        fetch("/api/warehouses?type=SAN_XUAT"),
      ]);
      setGroups(await gRes.json());
      setWarehouses(await wRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/shelf-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType.trim() || undefined }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      setNewName("");
      setNewType("");
      toast.success("Đã tạo Nhóm");
      load();
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (g: Group) => { setEditingId(g.id); setEditingName(g.name); setEditingType(g.type ?? ""); };

  const saveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    await fetch(`/api/shelf-groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName.trim(), type: editingType.trim() || undefined }),
    });
    setEditingId(null);
    load();
  };

  const removeGroup = async (id: string) => {
    await fetch(`/api/shelf-groups/${id}`, { method: "DELETE" });
    toast.success("Đã xoá Nhóm");
    load();
  };

  const openPicker = (groupId: string) => {
    setPickerGroupId(groupId);
    setPickerWarehouseId(warehouses[0]?.id ?? null);
    setPickerRoomId(warehouses[0]?.rooms[0]?.id ?? null);
  };

  const pickerWarehouse = warehouses.find((w) => w.id === pickerWarehouseId) ?? null;
  const pickerRoom = pickerWarehouse?.rooms.find((r) => r.id === pickerRoomId) ?? null;

  const blocksInPickerRoom = (() => {
    if (!pickerRoom) return [];
    const map = new Map<string, { block: string; shelfCount: number; groupId: string | null; groupName: string | null }>();
    for (const s of pickerRoom.shelves) {
      if (!s.block) continue;
      const entry = map.get(s.block) ?? { block: s.block, shelfCount: 0, groupId: s.group?.id ?? null, groupName: s.group?.name ?? null };
      entry.shelfCount += 1;
      map.set(s.block, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.block.localeCompare(b.block));
  })();

  // Mỗi lần đổi phòng đang xem, nạp lại trạng thái tick theo dữ liệu thật (block nào đang thuộc đúng
  // Nhóm này) — tick/bỏ tick chỉ sửa tạm trên UI, phải bấm "Lưu" mới thực sự gọi API.
  useEffect(() => {
    const current = new Set(blocksInPickerRoom.filter((b) => b.groupId === pickerGroupId).map((b) => b.block));
    setSelectedBlocks(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerRoomId, pickerGroupId]);

  const toggleBlockChecked = (block: string) => {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(block)) next.delete(block); else next.add(block);
      return next;
    });
  };

  const saveBlocks = async () => {
    if (!pickerGroupId || !pickerRoomId) return;
    const currentlyInGroup = blocksInPickerRoom.filter((b) => b.groupId === pickerGroupId).map((b) => b.block);
    const toAssign = Array.from(selectedBlocks).filter((b) => !currentlyInGroup.includes(b));
    const toUnassign = currentlyInGroup.filter((b) => !selectedBlocks.has(b));
    if (toAssign.length === 0 && toUnassign.length === 0) { setPickerGroupId(null); return; }

    setSaving(true);
    try {
      const calls = [];
      if (toAssign.length > 0) {
        calls.push(fetch(`/api/shelf-groups/${pickerGroupId}/blocks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: pickerRoomId, blocks: toAssign, action: "assign" }),
        }));
      }
      if (toUnassign.length > 0) {
        calls.push(fetch(`/api/shelf-groups/${pickerGroupId}/blocks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: pickerRoomId, blocks: toUnassign, action: "unassign" }),
        }));
      }
      const results = await Promise.all(calls);
      if (results.some((r) => !r.ok)) { toast.error("Có lỗi xảy ra"); return; }
      toast.success("Đã lưu");
      setPickerGroupId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const pickerGroup = groups.find((g) => g.id === pickerGroupId) ?? null;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary-strong" /> Nhóm giàn kệ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Gộp nhiều block giàn kệ (VD block R01 + R02) thành 1 Nhóm — thuộc tính không bắt buộc, chỉ Admin cấp cao cài đặt
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tạo Nhóm mới</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Input
            placeholder="Tên nhóm, VD: Nhóm A"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createGroup(); }}
            className="max-w-xs"
          />
          <Input
            placeholder="Loại nhóm (không bắt buộc)"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createGroup(); }}
            className="max-w-xs"
          />
          <Button onClick={createGroup} disabled={creating || !newName.trim()} className="bg-primary hover:bg-primary-hover">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Tạo
          </Button>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Layers className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có Nhóm nào</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  {editingId === g.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8 max-w-xs" placeholder="Tên nhóm" />
                      <Input value={editingType} onChange={(e) => setEditingType(e.target.value)} className="h-8 max-w-xs" placeholder="Loại nhóm" />
                      <Button size="sm" variant="ghost" onClick={() => saveEdit(g.id)}><Check className="w-4 h-4 text-primary-strong" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-text-muted" /></Button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{g.name}</CardTitle>
                        {g.type && <Badge variant="outline">{g.type}</Badge>}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{g.shelfCount} kệ</p>
                    </div>
                  )}
                  {editingId !== g.id && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" onClick={() => openPicker(g.id)}>
                        <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Quản lý block
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(g)}><Pencil className="w-3.5 h-3.5 text-text-muted" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => removeGroup(g.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {g.rooms.length === 0 ? (
                  <p className="text-sm text-text-muted">Chưa gán block nào</p>
                ) : (
                  <div className="space-y-1.5">
                    {g.rooms.map((r) => (
                      <div key={r.roomId} className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="text-text-secondary">{r.warehouseName} — {r.roomName}:</span>
                        {r.blocks.map((b) => <Badge key={b} variant="secondary">{b}</Badge>)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={pickerGroupId !== null} onOpenChange={(open) => !open && setPickerGroupId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quản lý block — {pickerGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select
                items={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                value={pickerWarehouseId ?? ""}
                onValueChange={(v) => {
                  setPickerWarehouseId(v as string);
                  const wh = warehouses.find((w) => w.id === v);
                  setPickerRoomId(wh?.rooms[0]?.id ?? null);
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn kho" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                items={(pickerWarehouse?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))}
                value={pickerRoomId ?? ""}
                onValueChange={(v) => setPickerRoomId(v as string)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn phòng" /></SelectTrigger>
                <SelectContent>
                  {pickerWarehouse?.rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {blocksInPickerRoom.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-6">Phòng này chưa có block nào</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto border rounded-lg p-2">
                {blocksInPickerRoom.map((b) => {
                  const checked = selectedBlocks.has(b.block);
                  const belongsToOtherGroup = b.groupId !== null && b.groupId !== pickerGroupId;
                  return (
                    <label key={b.block} className="flex items-center gap-2 py-1.5 px-1 text-sm cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={() => toggleBlockChecked(b.block)} />
                      <span className="font-mono font-medium">{b.block}</span>
                      <span className="text-text-secondary">({b.shelfCount} kệ)</span>
                      {belongsToOtherGroup && (
                        <span className="text-xs text-warning-foreground ml-auto">đang thuộc: {b.groupName}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setPickerGroupId(null)} disabled={saving}>
                Hủy
              </Button>
              <Button type="button" className="bg-primary hover:bg-primary-hover" onClick={saveBlocks} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                Lưu
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
