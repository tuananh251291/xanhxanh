"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, History, Loader2 } from "lucide-react";
import { format } from "date-fns";

type LotLine = { lotCode: string; plantTypeCode: string; plantTypeName: string; quantity: number; enteredAt: string };
type Group = {
  stageCode: string;
  handedOverQuantity: number;
  unqualifiedQuantity: number;
  recordedQuantity: number | null;
  lots: LotLine[];
};
type TransferRow = { id: string; code: string; status: string; createdAt: string; inspected: boolean; groups: Group[] };
type HandoversResponse = {
  lane: string | null;
  totalsByStage: Record<string, { handedOver: number; recorded: number }>;
  transfers: TransferRow[];
};

const STAGE_LABELS: Record<string, string> = { M05: "Mẫu mẹ (M05)", T05: "Thành phẩm T05", T01: "Thành phẩm T01", T10: "Thành phẩm T10" };
const STAGE_ORDER = ["M05", "T05", "T01", "T10"];
const unitOf = (stageCode: string) => (stageCode === "M05" ? "cụm" : "cây");

// Mục "Các lô đã bàn giao" ở đầu trang Bàn giao sản phẩm — thu gọn mặc định (chỉ NV cần tra cứu lại mới
// bấm mở, tránh chiếm chỗ màn hình chính là danh sách lô SẴN SÀNG bàn giao bên dưới). Tải dữ liệu LƯỜI
// (lazy) — chỉ gọi API lần đầu mở ra hoặc đổi tháng, không tải song song lúc vào trang.
export default function HandoverHistory() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [data, setData] = useState<HandoversResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transfers/my-handovers?month=${m}`);
      const json = await res.json();
      setData(json);
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loadedOnce) load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const changeMonth = (m: string) => {
    setMonth(m);
    load(m);
  };

  const rows = (data?.transfers ?? []).flatMap((t) =>
    t.groups.map((g) => ({
      key: `${t.id}-${g.stageCode}`,
      transferCode: t.code,
      createdAt: t.createdAt,
      ...g,
    }))
  );

  const totalsEntries = Object.entries(data?.totalsByStage ?? {}).sort(
    ([a], [b]) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)
  );

  return (
    <Card>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Các lô đã bàn giao
          </CardTitle>
          {open ? <ChevronUp className="w-5 h-5 text-text-secondary shrink-0" /> : <ChevronDown className="w-5 h-5 text-text-secondary shrink-0" />}
        </CardHeader>
      </button>

      {open && (
        <CardContent className="space-y-4 border-t border-divider pt-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Tháng</label>
            <Input type="month" value={month} onChange={(e) => changeMonth(e.target.value)} className="w-40" />
            {loading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
          </div>

          {!loading && data && (
            <>
              {totalsEntries.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {totalsEntries.map(([stageCode, t]) => (
                    <div key={stageCode} className="rounded-lg border border-divider p-3 bg-primary-light">
                      <p className="text-xs text-text-secondary">{STAGE_LABELS[stageCode] ?? stageCode}</p>
                      <p className="text-sm mt-1">
                        Bàn giao: <strong>{t.handedOver.toLocaleString("vi-VN")}</strong> {unitOf(stageCode)}
                      </p>
                      <p className="text-sm">
                        Ghi nhận: <strong className="text-primary-strong">{t.recorded.toLocaleString("vi-VN")}</strong> {unitOf(stageCode)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {rows.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">Chưa có lô nào bàn giao trong tháng này</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Ngày bàn giao</th>
                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Phiếu</th>
                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Lô / Mã cây</th>
                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Ngày nhập kho tối</th>
                        <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">SL bàn giao</th>
                        <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">SL ghi nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-b last:border-0 even:bg-primary-light align-top">
                          <td className="px-3 py-2 whitespace-nowrap">{format(new Date(r.createdAt), "dd/MM/yyyy")}</td>
                          <td className="px-3 py-2 font-mono">{r.transferCode}</td>
                          <td className="px-3 py-2">{STAGE_LABELS[r.stageCode] ?? r.stageCode}</td>
                          <td className="px-3 py-2">
                            {r.lots.map((l, i) => (
                              <div key={i}>{l.plantTypeCode} x{l.quantity.toLocaleString("vi-VN")}</div>
                            ))}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.lots.map((l, i) => (
                              <div key={i}>{format(new Date(l.enteredAt), "dd/MM/yyyy")}</div>
                            ))}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{r.handedOverQuantity.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-2 text-right">
                            {r.recordedQuantity === null ? (
                              <Badge variant="in-progress">Đang chờ kiểm tra</Badge>
                            ) : (
                              <span className="font-medium text-primary-strong">{r.recordedQuantity.toLocaleString("vi-VN")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
