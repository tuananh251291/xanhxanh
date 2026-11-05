"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ForecastEventKind, ForecastRow } from "@/lib/finished-stock-forecast-calc";

type Row = ForecastRow & { code: string; name: string };

const PAGE_SIZE = 30;

const KIND_LABELS: Record<ForecastEventKind, string> = {
  IN_TRANSIT: "Đang bàn giao về kho",
  ROOTING_EVALUATED: "Lô đã đánh giá đạt",
  ROOTING_ESTIMATED: "Lô đã lên giàn, chưa đánh giá",
  REGISTERED: "Số đăng ký sản xuất",
  SUPPLIER: "NCC giao",
  ORDER: "Đơn hàng xuất",
};

const fmt = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (key: string) => key.split("-").reverse().join("/");
const qtyClass = (n: number) => (n < 0 ? "text-destructive" : "");

export default function ForecastBoard({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Tìm mã cây hoặc tên cây"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        className="max-w-xs"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Loại cây</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tồn thực</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Lô khu SX</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Số đăng ký</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">NCC</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Đơn hàng</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tồn dự kiến</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Đáp ứng được</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const open = openId === r.plantTypeId;
                  return (
                    <Fragment key={r.plantTypeId}>
                      <tr className="border-b border-divider">
                        <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.stock)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.rooting)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.registered)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.supplier)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.orders)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${qtyClass(r.projected)}`}>{fmt(r.projected)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${qtyClass(r.lowestFromDate)}`}>{fmt(r.lowestFromDate)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={open ? "Thu gọn" : "Xem chi tiết"}
                            onClick={() => setOpenId(open ? null : r.plantTypeId)}
                          >
                            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-divider bg-background">
                          <td colSpan={10} className="px-3 py-3 space-y-2">
                            <p className="text-sm text-text-secondary">
                              Theo quy cách:{" "}
                              {r.byStage.length === 0
                                ? "không có"
                                : r.byStage.map((s) => `${s.stageCode ?? "Chưa có quy cách"}: ${fmt(s.quantity)}`).join(" · ")}
                            </p>
                            {r.events.length === 0 ? (
                              <p className="text-sm text-text-muted">Chưa có biến động dự kiến.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    <th className="text-left py-1 pr-3 text-sm text-primary-strong font-bold">Ngày</th>
                                    <th className="text-left py-1 pr-3 text-sm text-primary-strong font-bold">Biến động</th>
                                    <th className="text-left py-1 pr-3 text-sm text-primary-strong font-bold">Quy cách</th>
                                    <th className="text-right py-1 pr-3 text-sm text-primary-strong font-bold">Số lượng</th>
                                    <th className="text-left py-1 text-sm text-primary-strong font-bold">Ghi chú</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.events.map((e, i) => (
                                    <tr key={i} className="border-t border-divider">
                                      <td className="py-1 pr-3">{fmtDate(e.dateKey)}</td>
                                      <td className="py-1 pr-3">{KIND_LABELS[e.kind]}</td>
                                      <td className="py-1 pr-3">{e.stageCode ?? "—"}</td>
                                      <td className={`py-1 pr-3 text-right ${qtyClass(e.quantity)}`}>{e.quantity > 0 ? "+" : ""}{fmt(e.quantity)}</td>
                                      <td className="py-1 text-text-secondary">{e.note ?? ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-10 text-center text-text-muted">Không có mã cây nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-secondary">Trang {currentPage + 1}/{totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Trước
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>
              Sau <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
