"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { PackageCheck, Loader2, Check, AlertTriangle, ArrowLeft, Wand2, Plus, Trash2, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type PlacementLine = { shelfCode: string; quantity: number; pool: "OWNED" | "SHARED" | "RA_RE" | "MANUAL" };
type LotGroup = {
  lotId: string;
  lotCode: string;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  enteredAt: string;
  isBackup: boolean;
  placements: PlacementLine[];
  error: string | null;
};

type Row = {
  staffId: string;
  rootingGroups: LotGroup[];
  motherGroups: LotGroup[];
  hasPendingRooting: boolean;
  hasPendingMotherStock: boolean;
};

// Hiện khi trong lô đang chờ xếp có lô đến từ chỉ định cấy DỰ PHÒNG (isBackup) — nhắc KHO_MO biết mẫu
// mẹ của đợt này sẽ luôn về Kho mẫu mẹ chung chưa chia (không gộp vào kệ đã chia cá nhân của NV, xem
// src/lib/shelf-assignment.ts), kể cả khi tự nhập kệ tay cũng nên chọn 1 kệ chung thay vì kệ riêng của NV.
function BackupInstructionNotice({ hasMother, hasRooting }: { hasMother: boolean; hasRooting: boolean }) {
  if (!hasMother && !hasRooting) return null;
  return (
    <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-info-light bg-info-light px-3 py-2.5 text-sm text-info-foreground">
      <ShieldPlus className="w-4 h-4 shrink-0 mt-0.5" />
      <p>
        <b>Có lô từ Chỉ định cấy dự phòng.</b>{" "}
        {hasMother && "Mẫu mẹ sẽ được xếp về Kho mẫu mẹ chung chưa chia, không gộp vào kệ đã chia riêng của NV. "}
        Nếu tự nhập kệ tay, hãy chọn 1 kệ chung phù hợp thay vì kệ đã chia của NV.
      </p>
    </div>
  );
}

type Placement = { lotCode: string; shelfCode: string; quantity: number; pool: string };
type ManualRow = { shelfCode: string; quantity: string };
type ShelfOption = { value: string; label: string };

const POOL_LABELS: Record<string, string> = { SHARED: "Dư", MANUAL: "Tự nhập" };

// 1 nhóm = ĐÚNG 1 lô (mã cây + quy cách) — cặp nút "Xác nhận theo nguyên tắc"/"Tự nhập kệ" gắn riêng
// cho từng lô (rowSpan chỉ trong phạm vi các dòng của lô đó), không còn gộp chung theo cả stage như
// trước — KHO_MO xử lý xong lô nào xác nhận ngay lô đó, không phải chờ xong hết mọi lô khác.
function LotGroupRows({
  group, buttonLabel, processing, onConfirm, borderTop, secondaryButton,
}: {
  group: LotGroup;
  buttonLabel: string;
  processing: boolean;
  onConfirm: () => void;
  borderTop?: boolean;
  secondaryButton?: { label: string; onClick: () => void; disabled: boolean };
}) {
  const rows = group.error ? [null] : group.placements.length > 0 ? group.placements : [null];
  return (
    <>
      {rows.map((p, idx) => (
        <tr key={idx} className={`border-b last:border-0 even:bg-primary-light/30 ${borderTop && idx === 0 ? "border-t-2 border-t-border" : ""}`}>
          {p ? (
            <>
              <td className="px-4 py-3 font-mono text-text-secondary">{group.plantTypeCode}</td>
              <td className="px-4 py-3 text-foreground">{group.plantTypeName}</td>
              <td className="px-4 py-3"><Badge variant="outline">{group.stageCode}</Badge></td>
              <td className="px-4 py-3 text-right font-medium">
                {p.quantity.toLocaleString("vi-VN")} {group.stageCode.startsWith("M") ? "cụm" : "cây"}
              </td>
              <td className="px-4 py-3 text-text-secondary">{format(new Date(group.enteredAt), "dd/MM/yyyy", { locale: vi })}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{p.shelfCode}</Badge>
                {POOL_LABELS[p.pool] && <Badge className="bg-warning-light text-warning-foreground ml-1">{POOL_LABELS[p.pool]}</Badge>}
                {group.isBackup && <Badge className="bg-info-light text-info-foreground ml-1">Dự phòng</Badge>}
              </td>
            </>
          ) : (
            <td className="px-4 py-3" colSpan={6}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-secondary">{group.plantTypeCode}</span>
                <span className="text-destructive text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {group.error}</span>
              </div>
            </td>
          )}
          {idx === 0 && (
            <td className="px-4 py-3 align-top" rowSpan={rows.length}>
              <div className="flex flex-col gap-1.5 items-start">
                <Button
                  size="sm"
                  className="h-8 bg-primary hover:bg-primary-hover"
                  disabled={processing || !!group.error}
                  onClick={onConfirm}
                >
                  {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  {buttonLabel}
                </Button>
                {secondaryButton && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={secondaryButton.disabled}
                    onClick={secondaryButton.onClick}
                  >
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" /> {secondaryButton.label}
                  </Button>
                )}
              </div>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function ManualPlacementForm({
  totalRequired, processing, shelfOptions, loadingShelfOptions, onSubmit, onCancel,
}: {
  totalRequired: number;
  processing: boolean;
  shelfOptions: ShelfOption[];
  loadingShelfOptions: boolean;
  onSubmit: (rows: { shelfCode: string; quantity: number }[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ManualRow[]>([{ shelfCode: "", quantity: "" }]);

  const setRow = (idx: number, field: keyof ManualRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, { shelfCode: "", quantity: "" }]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const allShelfCodesFilled = rows.every((r) => r.shelfCode.trim().length > 0);
  const canSubmit = total === totalRequired && allShelfCodesFilled && rows.length > 0 && !processing;

  const submit = () => {
    onSubmit(rows.map((r) => ({ shelfCode: r.shelfCode.trim().toUpperCase(), quantity: Number(r.quantity) || 0 })));
  };

  return (
    <div className="p-4 bg-warning-light/40 border-t-2 border-t-warning space-y-3">
      <p className="text-sm font-medium text-warning-foreground">
        Tự nhập kệ mẫu mẹ (không theo nguyên tắc) — dùng cho trường hợp phát sinh, cần nhập đủ đúng tổng số cụm đang chờ.
      </p>
      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Combobox
              items={shelfOptions}
              value={shelfOptions.find((o) => o.value === r.shelfCode) ?? null}
              isItemEqualToValue={(a: ShelfOption, b: ShelfOption) => a.value === b.value}
              onValueChange={(v) => setRow(idx, "shelfCode", v ? (v as ShelfOption).value : "")}
              disabled={loadingShelfOptions}
            >
              <ComboboxInputGroup className="w-64 h-11 md:h-8">
                <ComboboxInput placeholder="Gõ mã kệ, VD: SX-A-PM-A01C01" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy kệ phù hợp</ComboboxEmpty>
                <ComboboxList>
                  {(item: ShelfOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Input
              type="number"
              min={0}
              placeholder="Số cụm"
              value={r.quantity}
              onChange={(e) => setRow(idx, "quantity", e.target.value)}
              className="w-32"
            />
            <span className="text-xs text-text-secondary">cụm</span>
            {rows.length > 1 && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeRow(idx)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={addRow} className="h-8">
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm kệ
      </Button>
      <p className={`text-sm font-medium ${total === totalRequired ? "text-primary-strong" : "text-destructive"}`}>
        Đã nhập: {total.toLocaleString("vi-VN")} / Cần xếp: {totalRequired.toLocaleString("vi-VN")} cụm
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
          {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          Xác nhận sắp xếp thủ công
        </Button>
        <Button size="sm" variant="ghost" className="h-8" disabled={processing} onClick={onCancel}>
          Huỷ, quay lại theo nguyên tắc
        </Button>
      </div>
    </div>
  );
}

export default function PlaceStaffBoard({ staffId }: { staffId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  // Đang xử lý lô nào (lotId) — chỉ 1 lô xử lý cùng lúc trên UI này, không khoá các lô khác.
  const [processingLotId, setProcessingLotId] = useState<string | null>(null);
  // Lô nào đang mở form "tự nhập kệ" — chỉ 1 form mở cùng lúc, bấm sang lô khác thì tự đóng form cũ.
  const [manualLotId, setManualLotId] = useState<string | null>(null);
  // Gợi ý mã kệ Phòng mẫu mẹ (autocomplete) — chỉ tải 1 lần khi thật sự mở form tự nhập, không tải sẵn
  // lúc vào trang vì phần lớn lượt xếp kệ đi theo nguyên tắc, không cần tới danh sách này.
  const [shelfOptions, setShelfOptions] = useState<ShelfOption[]>([]);
  const [loadingShelfOptions, setLoadingShelfOptions] = useState(false);
  const [shelfOptionsLoaded, setShelfOptionsLoaded] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers/receive-phong-toi");
      const data = await res.json();
      const rows: Row[] = Array.isArray(data) ? data : [];
      setRow(rows.find((r) => r.staffId === staffId) ?? null);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Mở form tự nhập kệ lần đầu mới tải gợi ý mã kệ — chỉ tải đúng 1 lần cho cả phiên xem trang này.
  useEffect(() => {
    if (!manualLotId || shelfOptionsLoaded) return;
    setShelfOptionsLoaded(true);
    setLoadingShelfOptions(true);
    fetch("/api/transfers/receive-phong-toi/shelf-suggestions")
      .then((res) => res.json())
      .then((codes: string[]) => setShelfOptions(codes.map((c) => ({ value: c, label: c }))))
      .finally(() => setLoadingShelfOptions(false));
  }, [manualLotId, shelfOptionsLoaded]);

  const showToast = (stage: "THANH_PHAM" | "MAU_ME", placements: Placement[]) => {
    const lines = placements.map((p) =>
      `${p.lotCode} → ${p.shelfCode} (${p.quantity.toLocaleString("vi-VN")}${p.pool === "SHARED" ? ", dư sang Kho chung" : ""})`
    );
    toast.success(stage === "THANH_PHAM" ? "Đã xếp kệ cây ra rễ" : "Đã xếp kệ mẫu mẹ", { description: lines.join(" · ") });
  };

  const confirmLot = async (stage: "THANH_PHAM" | "MAU_ME", lotId: string) => {
    setProcessingLotId(lotId);
    try {
      const res = await fetch("/api/transfers/receive-phong-toi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, stage, lotId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      showToast(stage, json.placements ?? []);
      loadData();
    } finally {
      setProcessingLotId(null);
    }
  };

  const confirmManual = async (lotId: string, manualRows: { shelfCode: string; quantity: number }[]) => {
    setProcessingLotId(lotId);
    try {
      const res = await fetch("/api/transfers/receive-phong-toi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, stage: "MAU_ME", lotId, manualPlacements: manualRows }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      showToast("MAU_ME", json.placements ?? []);
      setManualLotId(null);
      loadData();
    } finally {
      setProcessingLotId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (!row) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-4">
          <PackageCheck className="w-10 h-10 mx-auto text-primary-strong" />
          <p className="text-foreground font-medium">Đã hoàn tất sắp xếp về kho cho nhân viên này</p>
          <Link href="/transfers/receive-phong-toi">
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Quay lại danh sách</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const manualGroup = row.motherGroups.find((g) => g.lotId === manualLotId) ?? null;

  return (
    <Card>
      <CardContent className="p-0">
        <BackupInstructionNotice
          hasMother={row.motherGroups.some((g) => g.isBackup)}
          hasRooting={row.rootingGroups.some((g) => g.isBackup)}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Ngày nhập kho tối</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Kệ chỉ định</th>
                <th className="text-left px-4 py-3 font-bold text-base">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {row.rootingGroups.map((g, idx) => (
                <LotGroupRows
                  key={g.lotId}
                  group={g}
                  buttonLabel="Xác nhận xếp xong"
                  processing={processingLotId === g.lotId}
                  onConfirm={() => confirmLot("THANH_PHAM", g.lotId)}
                  borderTop={idx === 0}
                />
              ))}
              {row.motherGroups.map((g, idx) => (
                <LotGroupRows
                  key={g.lotId}
                  group={g}
                  buttonLabel="Xác nhận sắp xếp theo nguyên tắc"
                  processing={processingLotId === g.lotId && manualLotId !== g.lotId}
                  onConfirm={() => confirmLot("MAU_ME", g.lotId)}
                  borderTop={idx === 0 && row.rootingGroups.length > 0}
                  secondaryButton={{
                    label: manualLotId === g.lotId ? "Đang tự nhập kệ..." : "Không theo nguyên tắc — tự nhập kệ",
                    onClick: () => setManualLotId((v) => (v === g.lotId ? null : g.lotId)),
                    disabled: processingLotId === g.lotId && manualLotId !== g.lotId,
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
        {manualGroup && (
          <ManualPlacementForm
            totalRequired={manualGroup.quantity}
            processing={processingLotId === manualGroup.lotId}
            shelfOptions={shelfOptions}
            loadingShelfOptions={loadingShelfOptions}
            onSubmit={(rows) => confirmManual(manualGroup.lotId, rows)}
            onCancel={() => setManualLotId(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}
