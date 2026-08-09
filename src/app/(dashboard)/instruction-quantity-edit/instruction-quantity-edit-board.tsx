"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, PenLine, Save } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@prisma/client";
import { instructionDisplayStatus } from "@/types";

type Match = {
  id: string;
  code: string;
  plantType: { name: string; code: string };
  assignedTo: { name: string } | null;
};

type Item = {
  id: string;
  stageCode: string | null;
  quantity: number;
  motherSampleRatio: number | null;
  rootingRatio: number | null;
  shelf: { code: string; name: string } | null;
  lot: { code: string; quantity: number } | null;
};

type Detail = {
  id: string;
  code: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "ENDED";
  handedOverAt: string | null;
  motherReceivedAt: string | null;
  plantType: { name: string; code: string };
  assignedTo: { name: string } | null;
  items: Item[];
};

const STATUS_BADGE: Record<Detail["status"], "in-progress" | "completed" | "overdue" | "outline"> = {
  DRAFT: "outline",
  ACTIVE: "in-progress",
  COMPLETED: "completed",
  CANCELLED: "overdue",
  ENDED: "outline",
};

// Cùng khuôn với daily-record-edit-board.tsx (gõ mã chỉ định để tìm) — nhưng thay vì sửa nhật ký cấy
// hàng ngày, trang này sửa "Số lượng dùng" (quantity) của từng dòng quy cách nguồn. Điểm khác biệt: mỗi
// role có 1 cửa sổ được sửa khác nhau (xem page.tsx + PATCH .../editQuantities) nên phải tự tính trước
// "lockReason" ở client để hiện lý do rõ ràng, không chỉ đợi server trả lỗi sau khi bấm Lưu.
export default function InstructionQuantityEditBoard({ role }: { role: UserRole }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/instructions/${id}`);
      const data: Detail = await res.json();
      setSelected(data);
      setValues(Object.fromEntries(data.items.map((i) => [i.id, String(i.quantity)])));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const pick = useCallback(async (m: Match) => {
    await loadDetail(m.id);
  }, [loadDetail]);

  const search = async () => {
    const code = query.trim();
    if (!code) return;
    setSearching(true);
    setSearched(false);
    setSelected(null);
    try {
      const res = await fetch(`/api/instructions?code=${encodeURIComponent(code)}`);
      const data: Match[] = await res.json();
      const list = Array.isArray(data) ? data : [];
      setMatches(list);
      setSearched(true);
      const exact = list.find((i) => i.code.toLowerCase() === code.toLowerCase());
      if (exact) await pick(exact);
      else if (list.length === 1) await pick(list[0]);
    } finally {
      setSearching(false);
    }
  };

  const lockReason: string | null = !selected
    ? null
    : selected.status !== "ACTIVE" && selected.status !== "DRAFT"
    ? "Chỉ định đã kết thúc hoặc đã hủy — không thể sửa số lượng."
    : role === "KHO_MO" && selected.motherReceivedAt
    ? "NV cấy mô đã xác nhận nhận mẫu mẹ — không thể sửa số lượng nữa."
    : null;

  const isDirty = !!selected && selected.items.some((i) => values[i.id] !== String(i.quantity));

  const save = async () => {
    if (!selected) return;
    const items = selected.items.map((i) => {
      const n = Number(values[i.id]);
      return { itemId: i.id, quantity: n };
    });
    for (const i of items) {
      if (!Number.isInteger(i.quantity) || i.quantity <= 0) {
        toast.error("Số lượng dùng phải là số nguyên dương");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/instructions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editQuantities: { items } }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã lưu số lượng mới");
      await loadDetail(selected.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PenLine className="w-6 h-6 text-primary-strong" /> Sửa SL chỉ định cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhập mã chỉ định cấy để sửa lại số lượng dùng của từng dòng quy cách nguồn
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 max-w-md">
            <Input
              placeholder="VD: CDAA01C05201026"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button onClick={search} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {searched && matches.length === 0 && (
            <p className="text-sm text-text-muted mt-3">Không tìm thấy chỉ định nào khớp mã này.</p>
          )}

          {searched && matches.length > 1 && (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-text-secondary">Tìm thấy {matches.length} chỉ định — chọn đúng chỉ định:</p>
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-md border ${
                    selected?.id === m.id ? "border-primary bg-primary-light" : "border-divider hover:bg-muted"
                  }`}
                >
                  <span className="font-mono">{m.code}</span> — {m.plantType.name}
                  {m.assignedTo && <span className="text-text-secondary"> · NV {m.assignedTo.name}</span>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loadingDetail && (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
      )}

      {selected && !loadingDetail && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {selected.code} — {selected.plantType.name}
                {selected.assignedTo && <span className="font-normal text-text-secondary text-sm"> · NV {selected.assignedTo.name}</span>}
              </CardTitle>
            </div>
            {(() => {
              const { label, notStarted } = instructionDisplayStatus(selected.status, selected.handedOverAt);
              return <Badge variant={notStarted ? "outline" : STATUS_BADGE[selected.status]}>{label}</Badge>;
            })()}
          </CardHeader>
          <CardContent className="space-y-4">
            {lockReason && (
              <p className="text-sm text-destructive bg-danger-light rounded-md px-3 py-2">{lockReason}</p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-primary-strong">
                    <th className="px-3 py-2 text-left font-bold text-base">Kệ nguồn</th>
                    <th className="px-3 py-2 text-left font-bold text-base">Quy cách</th>
                    <th className="px-3 py-2 text-left font-bold text-base">Lô nguồn</th>
                    <th className="px-3 py-2 text-right font-bold text-base">SL dùng (cụm)</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item, idx) => (
                    <tr key={item.id} className={`border-b ${idx % 2 === 0 ? "bg-primary-light/60" : "bg-white"}`}>
                      <td className="px-3 py-2 whitespace-nowrap">{item.shelf?.code ?? "—"}</td>
                      <td className="px-3 py-2">{item.stageCode ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{item.lot?.code ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={1}
                          disabled={!!lockReason || saving}
                          className="w-28 ml-auto text-right"
                          value={values[item.id] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                        />
                        {item.lot && (
                          <p className="text-xs text-text-muted mt-1">
                            {role === "SUPER_ADMIN"
                              ? `lô nguồn có ${item.lot.quantity.toLocaleString("vi-VN")} cụm (được sửa vượt số này)`
                              : `tối đa ${item.lot.quantity.toLocaleString("vi-VN")} cụm`}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={!!lockReason || !isDirty || saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu thay đổi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
