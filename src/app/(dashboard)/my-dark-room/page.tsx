"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Moon, AlertTriangle, Loader2, ChevronRight } from "lucide-react";
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

function LotCard({ lot, onUpdated }: { lot: Lot; onUpdated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const contaminated = lot.initialQuantity - lot.quantity;
  const contaminationRate = contaminated / lot.initialQuantity;

  return (
    <Card className={contaminationRate > 0.2 ? "border-red-300" : ""}>
      <CardContent className="py-3">
        <div className="flex items-start justify-between">
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

  const loadLots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lots?warehouseType=PHONG_TOI&status=ACTIVE");
      if (res.ok) {
        const data = await res.json();
        setLots(data);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Moon className="w-6 h-6 text-indigo-600" /> Phòng tối cá nhân
        </h1>
        <p className="text-gray-500 text-sm mt-1">Quản lý lô mô đang trong phòng tối — báo cáo nhiễm</p>
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
          {Object.entries(byInst).map(([instrCode, instrLots]) => (
            <div key={instrCode}>
              <h2 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <ChevronRight className="w-4 h-4" /> Chỉ định: <span className="font-mono text-blue-700">{instrCode}</span>
                <Badge variant="secondary" className="ml-1">{instrLots.length} lô</Badge>
              </h2>
              <div className="space-y-2">
                {instrLots.map((lot) => (
                  <LotCard key={lot.id} lot={lot} onUpdated={loadLots} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
