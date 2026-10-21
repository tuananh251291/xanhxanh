"use client";

import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileUp, Loader2, FileCheck, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/invoice-engine";

type PriceCheckStatus = "OK" | "PRICE_MISMATCH" | "NOT_IN_PRICE_LIST" | "NO_PRICE_YET";

type PriceCheckRow = {
  no: string;
  itemCode: string;
  modelName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: PriceCheckStatus;
  currentPrice: number | null;
  productName: string | null;
  tier: string | null;
};

type Result = { invoiceNo: string | null; invoiceDate: string | null; currency: string; priceListMonth: string; rows: PriceCheckRow[] };
type MarketOpt = { id: string; code: string; name: string; currency: string; derivedCurrency: string | null };

const STATUS_BADGE: Record<PriceCheckStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  OK: { label: "Khớp", className: "bg-success-light text-success-foreground", icon: CheckCircle2 },
  PRICE_MISMATCH: { label: "Sai giá", className: "bg-danger-light text-destructive", icon: AlertTriangle },
  NOT_IN_PRICE_LIST: { label: "Không có trong bảng giá", className: "bg-warning-light text-warning-foreground", icon: HelpCircle },
  NO_PRICE_YET: { label: "Không có giá ở bậc này", className: "bg-warning-light text-warning-foreground", icon: HelpCircle },
};

export default function PriceCheckBoard({ markets }: { markets: MarketOpt[] }) {
  const [marketId, setMarketId] = useState("");
  const [currency, setCurrency] = useState("");
  const market = markets.find((m) => m.id === marketId) ?? null;
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCheck = async () => {
    if (!file) { toast.error("Vui lòng chọn file PDF đơn đặt hàng"); return; }
    if (!marketId) { toast.error("Chọn thị trường của đơn đặt hàng"); return; }
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("marketId", marketId);
      formData.append("currency", currency || market?.currency || "");
      const res = await fetch("/api/price-check", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setResult(json);
      const mismatches = json.rows.filter((r: PriceCheckRow) => r.status !== "OK").length;
      if (mismatches === 0) toast.success("Tất cả sản phẩm đều khớp bảng giá");
      else toast.warning(`Phát hiện ${mismatches} dòng cần kiểm tra lại`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={marketId} onChange={(e) => { setMarketId(e.target.value); setCurrency(""); }}>
              <option value="">— Thị trường —</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
            </select>
            {market?.derivedCurrency && (
              <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={currency || market.currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value={market.currency}>{market.currency}</option>
                <option value={market.derivedCurrency}>{market.derivedCurrency}</option>
              </select>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-strong hover:file:bg-primary-light/70"
            />
            <Button
              type="button"
              className="bg-primary hover:bg-primary-hover shrink-0"
              disabled={!file || !marketId || loading}
              onClick={handleCheck}
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
              Kiểm tra
            </Button>
          </div>
          <p className="text-xs text-text-secondary">Chỉ hỗ trợ file PDF đơn đặt hàng xuất khẩu (không phải ảnh scan). Giá đối chiếu theo Bảng giá tháng đã duyệt của thị trường, theo bậc tổng số lượng từng mã.</p>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-divider flex items-center gap-2 text-sm text-text-secondary">
              <FileCheck className="w-4 h-4 text-info-foreground" />
              {result.invoiceNo && <span>Số đơn: <span className="font-medium text-foreground">{result.invoiceNo}</span></span>}
              {result.invoiceDate && <span>· Ngày: <span className="font-medium text-foreground">{result.invoiceDate}</span></span>}
              <span>· {result.rows.length} dòng sản phẩm · Bảng giá tháng {result.priceListMonth} ({result.currency})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã SP</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên SP (đơn đặt hàng)</th>
                    <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">SL</th>
                    <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Giá trên đơn</th>
                    <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Giá hệ thống</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => {
                    const badge = STATUS_BADGE[row.status];
                    const Icon = badge.icon;
                    return (
                      <tr key={i} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{row.itemCode}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.productName ?? row.modelName}</td>
                        <td className="px-4 py-3 text-sm text-right text-text-secondary">{row.quantity.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-foreground">{fmtMoney(row.unitPrice, result.currency)}</td>
                        <td className="px-4 py-3 text-sm text-right text-text-secondary">
                          {row.currentPrice !== null ? fmtMoney(row.currentPrice, result.currency) : "—"}
                          {row.tier && <span className="block text-xs text-text-muted">bậc {row.tier}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${badge.className} gap-1`}>
                            <Icon className="w-3.5 h-3.5" /> {badge.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
