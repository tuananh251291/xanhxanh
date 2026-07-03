"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Moon, AlertTriangle, Loader2, ChevronRight, Send, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type Lot = {
  id: string;
  code: string;
  stage: "MAU_ME" | "THANH_PHAM";
  quantity: number;
  initialQuantity: number;
  status: string;
  plantType: { name: string; code: string };
  shelf?: { name: string; warehouse: { name: string } } | null;
  _count: { contaminations: number };
  enteredAt: string;
};

function ContaminationForm({ lot, onDone }: { lot: Lot; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const quantity = parseInt(qty);
    if (!quantity || quantity <= 0) { toast.error("Nhập số lượng nhiễm"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/contamination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.id, quantity, notes }),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success("Đã báo cáo nhiễm — chờ KHO_MO xác nhận");
      setQty(""); setNotes(""); onDone();
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2 space-y-2">
      <p className="text-sm font-medium text-red-700">Báo cáo nhiễm cho lô {lot.code}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Số lượng nhiễm</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" max={lot.quantity} placeholder="0" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Ghi chú</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mô tả..." className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="text-xs" onClick={onDone}>Hủy</Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs" onClick={submit} disabled={loading}>
          {loading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Gửi báo cáo
        </Button>
      </div>
    </div>
  );
}

function LotCard({
  lot, onUpdated, selected, onToggleSelect,
}: {
  lot: Lot;
  onUpdated: () => void;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const contaminated = lot.initialQuantity - lot.quantity;
  const contaminationRate = contaminated / lot.initialQuantity;

  return (
    <Card className={contaminationRate > 0.2 ? "border-red-300" : ""}>
      <CardContent className="py-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <Checkbox checked={selected} onCheckedChange={(v) => onToggleSelect(v === true)} className="mt-1" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-blue-700">{lot.code}</span>
                <Badge variant="secondary" className="text-xs">{lot.stage === "MAU_ME" ? "Mẫu mẹ" : "Thành phẩm"}</Badge>
                {contaminationRate > 0.2 && (
                  <Badge className="bg-red-100 text-red-700 text-xs">⚠️ Nhiễm cao {Math.round(contaminationRate * 100)}%</Badge>
                )}
              </div>
              <p className="text-sm text-gray-700">{lot.plantType.name}</p>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>Tồn: <strong>{lot.quantity.toLocaleString("vi-VN")}</strong></span>
                {contaminated > 0 && <span className="text-red-500">Đã nhiễm: {contaminated.toLocaleString("vi-VN")}</span>}
                {lot.shelf && <span>Kệ: {lot.shelf.name}</span>}
                {lot._count.contaminations > 0 && <span>Lần báo: {lot._count.contaminations}</span>}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            {showForm ? "Đóng" : "Báo nhiễm"}
          </Button>
        </div>
        {showForm && <ContaminationForm lot={lot} onDone={() => { setShowForm(false); onUpdated(); }} />}
      </CardContent>
    </Card>
  );
}

export default function MyDarkRoomPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadLots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lots?roomType=PHONG_TOI&status=ACTIVE");
      if (res.ok) {
        const data = await res.json();
        setLots(data);
        setSelected({});
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLots(); }, [loadLots]);

  const lots_ = lots as (Lot & { instruction?: { code: string } | null })[];
  const byInst = lots_.reduce<Record<string, (Lot & { instruction?: { code: string } | null })[]>>((acc, lot) => {
    const key = lot.instruction?.code ?? "Không có chỉ định";
    if (!acc[key]) acc[key] = [];
    acc[key].push(lot);
    return acc;
  }, {});

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allSelected = lots.length > 0 && selectedIds.length === lots.length;

  const toggleAll = () => {
    setSelected(allSelected ? {} : Object.fromEntries(lots.map((l) => [l.id, true])));
  };

  const submitHandoff = async () => {
    if (selectedIds.length === 0) { toast.error("Chọn ít nhất 1 lô để bàn giao"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedIds.map((id) => {
            const lot = lots.find((l) => l.id === id)!;
            return { lotId: id, quantity: lot.quantity };
          }),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã gửi phiếu bàn giao ${selectedIds.length} lô cho Kho mô`);
      loadLots();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Moon className="w-6 h-6 text-indigo-600" /> Phòng tối cá nhân
        </h1>
        <p className="text-gray-500 text-sm mt-1">Quản lý lô mô đang trong phòng tối — báo cáo nhiễm, bàn giao cho Kho mô</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : lots.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Moon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có lô nào trong phòng tối</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          <Button variant="outline" size="sm" onClick={toggleAll}>
            <Check className="w-3.5 h-3.5 mr-1" /> {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </Button>
          {Object.entries(byInst).map(([instrCode, instrLots]) => (
            <div key={instrCode}>
              <h2 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <ChevronRight className="w-4 h-4" /> Chỉ định: <span className="font-mono text-blue-700">{instrCode}</span>
                <Badge variant="secondary" className="ml-1">{instrLots.length} lô</Badge>
              </h2>
              <div className="space-y-2">
                {instrLots.map((lot) => (
                  <LotCard
                    key={lot.id}
                    lot={lot}
                    onUpdated={loadLots}
                    selected={!!selected[lot.id]}
                    onToggleSelect={(checked) => setSelected((prev) => ({ ...prev, [lot.id]: checked }))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 flex items-center justify-between z-40">
          <p className="text-sm text-gray-600">Đã chọn <strong>{selectedIds.length}</strong> lô để bàn giao cho Kho mô</p>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={submitHandoff} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Bàn giao cho Kho mô
          </Button>
        </div>
      )}
    </div>
  );
}
