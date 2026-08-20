"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layers, User, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import ContaminationDraftSubmit from "@/components/shared/contamination-draft-submit";

type ContaminationCategory = "DANG_THUC_HIEN" | "LO_BAN_GIAO";
type Balance = {
  staffId: string; staffCode: string | null; staffName: string | null;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string;
  category: ContaminationCategory; quantity: number;
};
type StaffCheck = { staffId: string; staffCode: string; staffName: string; checked: boolean };
// checked = null cho bucket "" (tồn cũ/không rõ NV) — không có khái niệm "kiểm tra kho nhiễm cá nhân" vì
// không phải 1 NV cấy mô thật.
type StaffGroup = { staffId: string; label: string; totalQuantity: number; rows: Balance[]; checked: boolean | null };

// DANG_THUC_HIEN chỉ áp dụng cho M05 (đang nhập nhật ký cho chỉ định đang làm, chưa tạo lô thật để bàn
// giao); LO_BAN_GIAO áp dụng cho M05/T01/T05 phát hiện trên 1 lô cụ thể đã có ngày nhập/bàn giao thật.
const CATEGORY_LABEL: Record<ContaminationCategory, string> = {
  DANG_THUC_HIEN: "Chỉ định cấy đang thực hiện",
  LO_BAN_GIAO: "Lô bàn giao (ngày thực tế)",
};

const rowKey = (plantTypeId: string, stageCode: string, category: string) => `${plantTypeId}:${stageCode}:${category}`;

// Bảng nhập trồng/hủy cho 1 NV (hoặc bucket "Chưa rõ NV / tồn cũ") đang được chọn — cùng cơ chế nhập 1
// trong 2 ô (còn lại tự tính phần dư) như trang Đề xuất Trồng/Hủy cũ, nhưng nguồn dữ liệu là số dư
// "chờ xử lý" của riêng NV đó (ContaminationStaffBalance) thay vì tồn gộp cả Phòng nhiễm — tách riêng
// theo nguồn gốc (category) vì cùng 1 mã cây/quy cách có thể vừa nhiễm từ chỉ định đang làm, vừa nhiễm
// từ lô đã bàn giao, không cộng gộp làm 1 dòng.
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
            <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Nguồn</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Đang chờ xử lý</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-28">Số trồng</th>
            <th className="text-right px-3 py-2 text-primary-strong font-bold text-base w-28">Số hủy</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((item) => {
            const key = rowKey(item.plantTypeId, item.stageCode, item.category);
            const huyRaw = entryByKey[key] ?? "";
            const huyNum = huyRaw === "" ? null : parseInt(huyRaw, 10) || 0;
            const trongDisplay = huyNum === null ? "" : String(Math.max(0, item.quantity - huyNum));
            return (
              <tr key={key} className="border-b border-divider last:border-0 even:bg-background">
                <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{item.plantTypeCode}</td>
                <td className="px-3 py-1.5 text-foreground">{item.plantTypeName}</td>
                <td className="px-3 py-1.5 text-foreground">{item.stageCode}</td>
                <td className="px-3 py-1.5 text-foreground">{CATEGORY_LABEL[item.category]}</td>
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

// "2. Kiểm tra kho nhiễm cá nhân" — danh sách TẤT CẢ NV cấy mô của kho, không chỉ NV đang có nhiễm chờ
// xử lý, vì việc kiểm tra là xác nhận vật lý (kể cả khi không có gì). Nhiệm vụ nhỏ này tự động hoàn thành
// (xem checklist.ts) khi tất cả NV ở đây đã được bấm "Kiểm tra xong" — không còn checkbox tự tích.
export default function ContaminationPersonalBoard({ onChecked }: { onChecked?: () => void }) {
  const [staffList, setStaffList] = useState<StaffCheck[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [entryByKey, setEntryByKey] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [draftKey, setDraftKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        fetch("/api/personal-contamination-checks").then((r) => r.json()),
        fetch("/api/contamination-staff-balances").then((r) => r.json()),
      ]);
      setStaffList(Array.isArray(s) ? s : []);
      setBalances(Array.isArray(b) ? b : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const staffGroups = useMemo<StaffGroup[]>(() => {
    const balancesByStaff = new Map<string, Balance[]>();
    for (const bal of balances) {
      const arr = balancesByStaff.get(bal.staffId) ?? [];
      arr.push(bal);
      balancesByStaff.set(bal.staffId, arr);
    }

    const groups: StaffGroup[] = staffList.map((s) => {
      const rows = balancesByStaff.get(s.staffId) ?? [];
      return {
        staffId: s.staffId,
        label: `${s.staffCode} — ${s.staffName}`,
        totalQuantity: rows.reduce((sum, r) => sum + r.quantity, 0),
        rows,
        checked: s.checked,
      };
    });

    const unattributedRows = balancesByStaff.get("") ?? [];
    if (unattributedRows.length > 0) {
      groups.push({
        staffId: "",
        label: "Chưa rõ NV / tồn cũ",
        totalQuantity: unattributedRows.reduce((sum, r) => sum + r.quantity, 0),
        rows: unattributedRows,
        checked: null,
      });
    }

    return groups.sort((a, b) => {
      if (a.staffId === "") return 1;
      if (b.staffId === "") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [staffList, balances]);

  const checkedCount = staffList.filter((s) => s.checked).length;
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
        const key = rowKey(r.plantTypeId, r.stageCode, r.category);
        const huyRaw = entryByKey[key];
        if (huyRaw === undefined || huyRaw === "") return null;
        const huyQuantity = Math.max(0, Math.min(r.quantity, parseInt(huyRaw, 10) || 0));
        return { plantTypeId: r.plantTypeId, stageCode: r.stageCode, category: r.category, huyQuantity, trongQuantity: r.quantity - huyQuantity };
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
      setDraftKey((k) => k + 1);
      load();
    } finally {
      setMerging(false);
    }
  };

  const markChecked = async (staffId: string) => {
    setChecking(true);
    try {
      const res = await fetch("/api/personal-contamination-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã đánh dấu kiểm tra xong");
      setSelectedStaffId(null);
      setEntryByKey({});
      await load();
      onChecked?.();
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      {staffGroups.length === 0 ? (
        <p className="text-sm text-text-muted">Không có NV cấy mô nào ở kho này.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">
            Đã kiểm tra {checkedCount}/{staffList.length} NV hôm nay — chọn 1 NV để xem/nhập đề xuất trồng/hủy rồi bấm &quot;Kiểm tra xong&quot;:
          </p>
          <div className="flex flex-wrap gap-2">
            {staffGroups.map((g) => (
              <button
                key={g.staffId || "unattributed"}
                type="button"
                onClick={() => selectStaff(g.staffId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  selectedStaffId === g.staffId
                    ? "bg-primary-light border-primary text-primary-strong font-semibold"
                    : g.checked
                    ? "bg-success-light border-success text-success-foreground"
                    : "bg-card border-divider text-foreground hover:border-primary"
                }`}
              >
                {g.checked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                {g.label}
                {g.totalQuantity > 0 && <Badge variant="in-progress">{g.totalQuantity.toLocaleString("vi-VN")}</Badge>}
              </button>
            ))}
          </div>

          {selectedGroup && (
            <Card>
              {selectedGroup.rows.length > 0 ? (
                <CardContent className="p-0">
                  <StaffEntryTable group={selectedGroup} entryByKey={entryByKey} onChangeHuy={changeHuy} onChangeTrong={changeTrong} />
                </CardContent>
              ) : (
                <CardContent className="py-6 text-center text-sm text-text-muted">
                  Không có nhiễm nào đang chờ xử lý
                </CardContent>
              )}
              <div className="flex flex-col items-end gap-2 p-3 pt-0">
                {selectedGroup.rows.length > 0 && (
                  <Button size="sm" className="bg-secondary hover:bg-secondary-hover text-secondary-foreground" disabled={merging} onClick={mergeSelected}>
                    {merging ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Layers className="w-4 h-4 mr-1.5" />}
                    Gộp phiếu
                  </Button>
                )}
                {selectedGroup.checked !== null && (
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90 text-success-foreground disabled:opacity-80"
                    disabled={checking || selectedGroup.checked}
                    onClick={() => markChecked(selectedGroup.staffId)}
                  >
                    {checking ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                    {selectedGroup.checked ? "Đã kiểm tra xong" : "Kiểm tra xong"}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      <ContaminationDraftSubmit key={draftKey} />
    </div>
  );
}
