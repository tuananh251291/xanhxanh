"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, PackageOpen, Send } from "lucide-react";
import { toast } from "sonner";

type LotGroup = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  available: number;
};

// Tồn hiện tại của Phòng theo dõi (Kho thành phẩm) gộp theo (loại cây, quy cách) — theo đúng quyết định
// đã chốt: không cần thêm mốc "đủ N ngày", cứ hiện tồn hiện tại cho Kho mô tự cân đối.
export default function SealingTaskForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [groups, setGroups] = useState<LotGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const groupKey = (g: { plantTypeId: string; stageCode: string }) => `${g.plantTypeId}:${g.stageCode}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const whRes = await fetch("/api/warehouses?type=THANH_PHAM");
      const whData = await whRes.json();
      const ktp = Array.isArray(whData) ? whData[0] : null;
      if (!ktp) { setGroups([]); return; }
      const roomRes = await fetch(`/api/rooms?warehouseId=${ktp.id}&type=PHONG_THEO_DOI`);
      const roomData = await roomRes.json();
      const room = Array.isArray(roomData) ? roomData[0] : null;
      if (!room) { setGroups([]); return; }
      const lotRes = await fetch(`/api/lots?roomId=${room.id}&status=ACTIVE`);
      const lots: { plantTypeId: string; stageCode: string; quantity: number; plantType: { code: string; name: string } }[] = await lotRes.json();

      const map: Record<string, LotGroup> = {};
      for (const lot of Array.isArray(lots) ? lots : []) {
        const key = `${lot.plantTypeId}:${lot.stageCode}`;
        if (!map[key]) {
          map[key] = { plantTypeId: lot.plantTypeId, plantTypeCode: lot.plantType.code, plantTypeName: lot.plantType.name, stageCode: lot.stageCode, available: 0 };
        }
        map[key].available += lot.quantity;
      }
      setGroups(Object.values(map).filter((g) => g.available > 0).sort((a, b) =>
        a.plantTypeCode === b.plantTypeCode ? a.stageCode.localeCompare(b.stageCode) : a.plantTypeCode.localeCompare(b.plantTypeCode)
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (g: LotGroup, value: boolean) => {
    const key = groupKey(g);
    setChecked((prev) => ({ ...prev, [key]: value }));
    if (!value) setQuantities((prev) => ({ ...prev, [key]: "" }));
  };

  const submit = async () => {
    const items = groups
      .filter((g) => checked[groupKey(g)])
      .map((g) => ({ plantTypeId: g.plantTypeId, stageCode: g.stageCode, quantity: parseInt(quantities[groupKey(g)] ?? "0", 10) || 0 }));
    if (items.length === 0) { toast.error("Chọn ít nhất 1 loại cây"); return; }
    if (items.some((i) => i.quantity <= 0)) { toast.error("Nhập số lượng cho các loại cây đã chọn"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sealing-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraWorkRequestId: requestId, items }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã giao việc hàn túi");
      router.push("/extra-work-requests");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>;
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <PackageOpen className="w-5 h-5 text-primary-strong" />
          <p className="text-sm text-text-secondary">
            Tích chọn loại cây cần hàn túi và nhập số lượng — lấy từ tồn hiện tại của Phòng theo dõi (Kho thành phẩm). Số lượng sẽ bị trừ ngay khi giao việc.
          </p>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-text-muted">Phòng theo dõi hiện không có hàng nào.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const key = groupKey(g);
              const isChecked = !!checked[key];
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 border rounded-lg p-2.5">
                  <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                    <Checkbox checked={isChecked} onCheckedChange={(v) => toggle(g, v === true)} />
                    <span className="text-sm">
                      <span className="font-mono text-xs text-text-muted mr-1">{g.plantTypeCode}</span>
                      {g.plantTypeName} <span className="font-medium">({g.stageCode})</span>
                    </span>
                  </label>
                  <span className="text-xs text-text-muted">Tồn: {g.available.toLocaleString("vi-VN")}</span>
                  <Input
                    type="number"
                    min={1}
                    max={g.available}
                    placeholder="SL"
                    className="w-24 h-8"
                    disabled={!isChecked}
                    value={quantities[key] ?? ""}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
        )}

        <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting || groups.length === 0}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Giao việc
        </Button>
      </CardContent>
    </Card>
  );
}
