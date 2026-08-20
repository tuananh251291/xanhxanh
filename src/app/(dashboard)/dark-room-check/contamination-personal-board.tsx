"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Layers, User, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

type Balance = {
  staffId: string; staffCode: string | null; staffName: string | null;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number;
};
type DraftLine = {
  id: string; staffId: string; staffName: string | null; type: "HUY" | "TRONG";
  plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number;
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
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [entryByKey, setEntryByKey] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, d] = await Promise.all([
        fetch("/api/contamination-staff-balances").then((r) => r.json()),
        fetch("/api/contamination-proposal-drafts").then((r) => r.json()),
      ]);
      setBalances(Array.isArray(b) ? b : []);
      setDraftLines(Array.isArray(d) ? d : []);
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
      load();
    } finally {
      setMerging(false);
    }
  };

  const submitDraft = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/contamination-proposal-drafts/submit", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã gửi ${json.count} đề xuất — chờ Admin duyệt`);
      load();
    } finally {
      setSubmitting(false);
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

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium text-foreground">Phiếu chung đang gộp</p>
              <p className="text-sm text-text-secondary">
                {draftLines.length === 0 ? "Chưa có dòng nào" : `${draftLines.length} dòng — bấm "Gửi đề xuất trồng/hủy" để gửi Admin duyệt`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {draftLines.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowDraft((v) => !v)}>
                  {showDraft ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Ẩn</> : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Xem</>}
                </Button>
              )}
              <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={submitting || draftLines.length === 0} onClick={submitDraft}>
                {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                Gửi đề xuất trồng/hủy
              </Button>
            </div>
          </div>
          {showDraft && draftLines.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-divider">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">NV nguồn</th>
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Loại</th>
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                    <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {draftLines.map((l) => (
                    <tr key={l.id} className="border-b border-divider last:border-0 even:bg-background">
                      <td className="px-3 py-1.5 text-foreground">{l.staffName ?? "Chưa rõ NV / tồn cũ"}</td>
                      <td className="px-3 py-1.5 text-foreground">{l.type === "HUY" ? "Hủy" : "Trồng"}</td>
                      <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{l.plantTypeCode}</td>
                      <td className="px-3 py-1.5 text-foreground">{l.stageCode}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-foreground">{l.quantity.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
