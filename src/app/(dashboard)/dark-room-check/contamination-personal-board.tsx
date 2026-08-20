"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layers, User } from "lucide-react";
import { toast } from "sonner";
import ContaminationDraftSubmit from "@/components/shared/contamination-draft-submit";

type Balance = {
  staffId: string; staffCode: string | null; staffName: string | null;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number;
};
type StaffGroup = { staffId: string; label: string; totalQuantity: number; rows: Balance[] };

// Bảng nhập trồng/hủy cho 1 NV (hoặc bucket "Chưa rõ NV / tồn cũ") đang được chọn — cùng cơ chế nhập 1
// trong 2 ô (còn lại tự tính phần dư) như trang Đề xuất Trồng/Hủy cũ, nhưng nguồn dữ liệu là số dư
// "chờ xử lý" của riêng NV đó (ContaminationStaffBalance) thay vì tồn gộp cả Phòng nhiễm.
function StaffEntryTable({ group, entryByKey, onChangeHuy, onChangeTrong }: {
  group: StaffGroup;
  entryByKey: Record<string, string>;
  onChangeHuy: (key: string, raw: string) => void;
  onChangeTrong: (key: string, raw: string, total: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Tên cây</th>
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Đang chờ xử lý</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-28">Số trồng</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-28">Số hủy</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((item) => {
            const key = `${item.plantTypeId}:${item.stageCode}`;
            const huyRaw = entryByKey[key] ?? "";
            const huyNum = huyRaw === "" ? null : parseInt(huyRaw, 10) || 0;
            const trongDisplay = huyNum === null ? "" : String(Math.max(0, item.quantity - huyNum));
            return (
              <tr key={key} className="border-b border-divider last:border-0 even:bg-background">
                <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{item.plantTypeCode}</td>
                <td className="px-3 py-1.5 text-foreground">{item.plantTypeName}</td>
                <td className="px-3 py-1.5 text-foreground">{item.stageCode}</td>
                <td className="px-3 py-1.5 text-right font-medium text-foreground">{item.quantity.toLocaleString("vi-VN")}</td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} max={item.quantity} className="h-9 text-right" value={trongDisplay}
                    onChange={(e) => onChangeTrong(key, e.target.value, item.quantity)} placeholder="0" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} max={item.quantity} className="h-9 text-right" value={huyRaw}
                    onChange={(e) => onChangeHuy(key, e.target.value)} placeholder="0" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ContaminationPersonalBoard() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [entryByKey, setEntryByKey] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [draftKey, setDraftKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetch("/api/contamination-staff-balances").then((r) => r.json());
      setBalances(Array.isArray(b) ? b : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const staffGroups = useMemo<StaffGroup[]>(() => {
    const map = new Map<string, StaffGroup>();
    for (const b of balances) {
      const g = map.get(b.staffId) ?? {
        staffId: b.staffId,
        label: b.staffId === "" ? "Chưa rõ NV / tồn cũ" : `${b.staffCode ?? ""} — ${b.staffName ?? "?"}`,
        totalQuantity: 0,
        rows: [],
      };
      g.totalQuantity += b.quantity;
      g.rows.push(b);
      map.set(b.staffId, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.staffId === "") return 1;
      if (b.staffId === "") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [balances]);

  const selectedGroup = staffGroups.find((g) => g.staffId === selectedStaffId) ?? null;

  const selectStaff = (staffId: string) => {
    setSelectedStaffId((cur) => (cur === staffId ? null : staffId));
    setEntryByKey({});
  };

  const changeHuy = (key: string, raw: string) => setEntryByKey((prev) => ({ ...prev, [key]: raw }));
  const changeTrong = (key: string, raw: string, total: number) =>
    setEntryByKey((prev) => ({ ...prev, [key]: raw === "" ? "" : String(Math.max(0, total - (parseInt(raw, 10) || 0))) }));

  const mergeSelected = async () => {
    if (!selectedGroup) return;
    const entries = selectedGroup.rows
      .map((r) => {
        const key = `${r.plantTypeId}:${r.stageCode}`;
        const huyRaw = entryByKey[key];
        if (huyRaw === undefined || huyRaw === "") return null;
        const huyQuantity = Math.max(0, Math.min(r.quantity, parseInt(huyRaw, 10) || 0));
        return { plantTypeId: r.plantTypeId, stageCode: r.stageCode, huyQuantity, trongQuantity: r.quantity - huyQuantity };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (entries.length === 0) { toast.error("Chưa nhập số lượng nào"); return; }

    setMerging(true);
    try {
      const res = await fetch("/api/contamination-proposal-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: selectedGroup.staffId, entries }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã gộp vào phiếu chung");
      setEntryByKey({});
      setSelectedStaffId(null);
      setDraftKey((k) => k + 1);
      load();
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      {staffGroups.length === 0 ? (
        <p className="text-sm text-text-muted">Không có NV nào đang có nhiễm chờ xử lý.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">Chọn 1 NV để xem và nhập đề xuất trồng/hủy cho số nhiễm của họ:</p>
          <div className="flex flex-wrap gap-2">
            {staffGroups.map((g) => (
              <button
                key={g.staffId || "unattributed"}
                type="button"
                onClick={() => selectStaff(g.staffId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  selectedStaffId === g.staffId
                    ? "bg-primary-light border-primary text-primary-strong font-semibold"
                    : "bg-card border-divider text-foreground hover:border-primary"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                {g.label}
                <Badge variant="in-progress">{g.totalQuantity.toLocaleString("vi-VN")}</Badge>
              </button>
            ))}
          </div>

          {selectedGroup && (
            <Card>
              <CardContent className="p-0">
                <StaffEntryTable group={selectedGroup} entryByKey={entryByKey} onChangeHuy={changeHuy} onChangeTrong={changeTrong} />
              </CardContent>
              <div className="flex justify-end p-3 pt-0">
                <Button size="sm" className="bg-secondary hover:bg-secondary-hover text-secondary-foreground" disabled={merging} onClick={mergeSelected}>
                  {merging ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Layers className="w-4 h-4 mr-1.5" />}
                  Gộp phiếu
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <ContaminationDraftSubmit key={draftKey} />
    </div>
  );
}
