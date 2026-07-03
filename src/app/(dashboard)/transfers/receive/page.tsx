"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageCheck, Loader2, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { motherClusterUnits } from "@/types";

type Shelf = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  capacity: number | null;
  assignedStaffId?: string | null;
  plantType: { id: string; code: string; name: string } | null;
  lots: { quantity: number; stageCode: string }[];
};
type TransferItem = {
  id: string;
  lotId: string;
  quantity: number;
  lot: { code: string; stage: string; stageCode: string; plantTypeId: string; plantType: { name: string } };
};
type Transfer = {
  id: string;
  code: string;
  status: string;
  fromUser: { name: string };
  fromWarehouse: { name: string; type: string } | null;
  fromRoom: { name: string; type: string } | null;
  toWarehouse: { shelves: Shelf[] };
  toRoom: { shelves: Shelf[] } | null;
  transferredAt: string;
  items: TransferItem[];
};

export default function TransferReceivePage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shelfMap, setShelfMap] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tRes = await fetch("/api/transfers?status=PENDING");
      const tData = await tRes.json();
      setTransfers(Array.isArray(tData) ? tData : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const confirm = async (transferId: string, items: TransferItem[], auto: boolean) => {
    const assignments = auto
      ? []
      : items.map((item) => ({ lotId: item.lotId, shelfId: shelfMap[item.lotId] ?? "" }));
    setProcessing(transferId);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", shelfAssignments: assignments }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      if (auto && Array.isArray(json.placements)) {
        const lines = json.placements.map((p: { lotCode: string; shelfCode: string; quantity: number; pool: string }) =>
          `${p.lotCode} → ${p.shelfCode} (${p.quantity.toLocaleString("vi-VN")}${p.pool === "SHARED" ? ", dư sang Kho chung" : ""})`
        );
        toast.success("Đã xếp kệ tự động", { description: lines.join(" · ") });
      } else {
        toast.success("Đã xác nhận nhận hàng");
      }
      loadData();
    } finally { setProcessing(null); }
  };

  const reject = async (transferId: string) => {
    setProcessing(transferId);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
      toast.success("Đã từ chối bàn giao");
      loadData();
    } finally { setProcessing(null); }
  };

  const pendingTransfers = transfers.filter((t) => t.status === "PENDING");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-blue-600" /> Nhận bàn giao
        </h1>
        <p className="text-gray-500 text-sm mt-1">{pendingTransfers.length} phiếu chờ xác nhận</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : pendingTransfers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <PackageCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có phiếu bàn giao nào đang chờ</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {pendingTransfers.map((t) => (
            <Card key={t.id} className="border-l-4 border-l-blue-500">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-blue-700">{t.code}</span>
                      <Badge className="bg-yellow-100 text-yellow-700">Chờ xác nhận</Badge>
                    </div>
                    <p className="text-sm text-gray-600">Từ: <strong>{t.fromUser.name}</strong></p>
                    {t.fromWarehouse && (
                      <p className="text-sm text-gray-500">
                        Nguồn: {t.fromWarehouse.name}{t.fromRoom ? ` — ${t.fromRoom.name}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">{format(t.transferredAt, "dd/MM/yyyy HH:mm", { locale: vi })}</p>
                    <p className="text-sm mt-1">{t.items.length} lô · {t.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("vi-VN")} mẫu</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  >
                    {expanded === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>

                {expanded === t.id && (() => {
                  const isAuto = t.fromRoom?.type === "PHONG_TOI";
                  return (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    {isAuto ? (
                      <>
                        <p className="text-xs text-gray-500 bg-blue-50 rounded p-2">
                          Bàn giao từ Phòng tối — hệ thống tự xếp kệ: mẫu mẹ (M03/M05) vào đúng kệ của nhân viên phụ trách
                          trong Kho mẫu mẹ đã chia (dư quá 1800 cụm sẽ tự chuyển sang Kho mẫu mẹ chung), cây ra rễ vào Phòng ra rễ.
                        </p>
                        <div className="space-y-1">
                          {t.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 text-sm">
                              <span className="font-mono text-blue-700">{item.lot.code}</span>
                              <span className="text-gray-500">{item.lot.plantType.name}</span>
                              <Badge variant="secondary" className="text-xs">{item.lot.stage === "MAU_ME" ? "MM" : "TP"}</Badge>
                              <span className="font-medium">{item.quantity.toLocaleString("vi-VN")}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-700">Phân bổ kệ cho từng lô:</p>
                        {t.items.map((item) => {
                          const allShelves = t.toRoom?.shelves ?? t.toWarehouse.shelves;
                          // Chỉ gợi ý kệ chưa gán loại cây hoặc đã gán đúng loại cây của lô này, và còn đủ chỗ.
                          const itemUnits = motherClusterUnits(item.lot.stageCode, item.quantity);
                          const compatibleShelves = allShelves.filter((s) => {
                            const used = s.lots.reduce((sum, l) => sum + motherClusterUnits(l.stageCode, l.quantity), 0);
                            const matchesPlantType = !s.plantType || s.plantType.id === item.lot.plantTypeId;
                            const hasRoom = !s.capacity || used + itemUnits <= s.capacity;
                            // Kệ Kho mẫu mẹ đã chia chỉ nhận khi đang trống — mỗi kệ tối đa 1 lô.
                            const notOccupiedAssigned = !s.assignedStaffId || s.lots.length === 0;
                            return matchesPlantType && hasRoom && notOccupiedAssigned;
                          });
                          return (
                            <div key={item.id} className="flex items-center gap-3 text-sm">
                              <div className="flex-1">
                                <span className="font-mono text-blue-700">{item.lot.code}</span>
                                <span className="text-gray-500 ml-2">{item.lot.plantType.name}</span>
                                <Badge variant="secondary" className="ml-2 text-xs">{item.lot.stage === "MAU_ME" ? "MM" : "TP"}</Badge>
                                <span className="ml-2 font-medium">{item.quantity.toLocaleString("vi-VN")}</span>
                              </div>
                              <Select onValueChange={(v) => setShelfMap((prev) => ({ ...prev, [item.lotId]: v as string }))}>
                                <SelectTrigger className="w-52">
                                  <SelectValue placeholder={compatibleShelves.length > 0 ? "Chọn kệ" : "Không có kệ phù hợp"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {compatibleShelves.map((s) => {
                                    const used = s.lots.reduce((sum, l) => sum + motherClusterUnits(l.stageCode, l.quantity), 0);
                                    return (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.code} — {s.name}{s.capacity ? ` (còn ${(s.capacity - used).toLocaleString("vi-VN")}/${s.capacity})` : ""}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => reject(t.id)}
                        disabled={processing === t.id}
                      >
                        <X className="w-4 h-4 mr-1" /> Từ chối
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => confirm(t.id, t.items, isAuto)}
                        disabled={processing === t.id}
                      >
                        {processing === t.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                        Xác nhận nhận hàng
                      </Button>
                    </div>
                  </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
