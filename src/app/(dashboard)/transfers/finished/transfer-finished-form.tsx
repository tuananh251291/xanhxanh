"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, PackagePlus, ScanLine, Loader2, Send, X, PlusCircle, Plus, ClipboardList, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import Link from "next/link";
import { PrintButton } from "@/components/shared/print-button";

const ShelfQrScanner = dynamic(() => import("@/components/shared/shelf-qr-scanner"), { ssr: false });

type ShelfLot = { id: string; code: string; quantity: number; stageCode: string; plantType: { id: string; code: string; name: string } };
type ScannedShelf = { id: string; code: string; name: string; roomId: string; lots: ShelfLot[] };
type Row = { rowId: string; shelf: ScannedShelf | null };

type PickableShelf = { id: string; code: string; name: string; warehouseName: string; roomName: string };

type CreatedTransfer = { id: string; code: string; transferredAt: string; shelves: ScannedShelf[] };

const PENDING_LABEL = { label: "Đã bàn giao / Chưa xác nhận", color: "bg-warning-light text-warning-foreground" };

// crypto.randomUUID() chỉ chạy được trong secure context (HTTPS hoặc localhost) — NV kho thường mở
// trang này qua IP LAN bằng HTTP thường (điện thoại), nên cần fallback không phụ thuộc secure context.
// rowId chỉ dùng làm key nội bộ trong form, không cần độ ngẫu nhiên cấp mật mã.
const newRowId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const newRow = (): Row => ({ rowId: newRowId(), shelf: null });

export default function TransferFinishedForm({
  khaDungRoomId, staffName, workplaceWarehouseId,
}: {
  khaDungRoomId: string;
  staffName: string;
  workplaceWarehouseId: string | null;
}) {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanningRowId, setScanningRowId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdTransfer, setCreatedTransfer] = useState<CreatedTransfer | null>(null);
  const [pickableShelves, setPickableShelves] = useState<PickableShelf[]>([]);

  useEffect(() => {
    // NV kho mô chỉ làm việc 1 kho sản xuất (nếu đã được gán địa điểm làm việc) — chỉ cho chọn giàn kệ
    // Phòng ra rễ thuộc đúng kho đó, không hiện kệ của kho sản xuất khác.
    const qs = workplaceWarehouseId ? `&warehouseId=${workplaceWarehouseId}` : "";
    fetch(`/api/rooms?type=PHONG_RA_RE${qs}`)
      .then((r) => r.json())
      .then((rooms: { name: string; warehouse: { name: string }; shelves: { id: string; code: string; name: string }[] }[]) => {
        if (!Array.isArray(rooms)) return;
        setPickableShelves(
          rooms.flatMap((room) =>
            room.shelves.map((s) => ({ id: s.id, code: s.code, name: s.name, warehouseName: room.warehouse.name, roomName: room.name }))
          )
        );
      });
  }, [workplaceWarehouseId]);

  const filledShelves = useMemo(() => rows.filter((r) => r.shelf).map((r) => r.shelf!), [rows]);

  const resolveAndFillRow = useCallback(async (rowId: string, code: string) => {
    if (filledShelves.some((s) => s.code === code)) {
      toast.info(`Đã có kệ ${code} trong danh sách`);
      return;
    }
    const res = await fetch(`/api/shelves?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) { toast.error(data.message ?? "Không tìm thấy giàn kệ"); return; }
    if (data.room?.type !== "PHONG_RA_RE") {
      toast.error(`Kệ ${code} không thuộc Phòng ra rễ — không hợp lệ`);
      return;
    }
    if (filledShelves.length > 0 && filledShelves[0].roomId !== data.room.id) {
      toast.error(`Kệ ${code} thuộc phòng ra rễ khác — chỉ được gộp chung 1 phiếu cùng phòng`);
      return;
    }
    if (data.lots.length === 0) toast.info(`Kệ ${code} không có thành phẩm nào`);
    else toast.success(`Đã thêm kệ ${code} — ${data.lots.length} lô`);

    const shelf: ScannedShelf = { id: data.id, code: data.code, name: data.name, roomId: data.room.id, lots: data.lots };
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, shelf } : r)));
  }, [filledShelves]);

  const pickShelfForRow = (rowId: string, shelfId: string) => {
    const shelf = pickableShelves.find((s) => s.id === shelfId);
    if (shelf) resolveAndFillRow(rowId, shelf.code);
  };

  const openScannerForRow = (rowId: string) => {
    setScanningRowId(rowId);
    setScannerOpen(true);
  };

  const handleScan = useCallback(async (code: string) => {
    if (!scanningRowId) return;
    await resolveAndFillRow(scanningRowId, code);
    setScannerOpen(false);
  }, [scanningRowId, resolveAndFillRow]);

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const allLots = useMemo(() => filledShelves.flatMap((s) => s.lots), [filledShelves]);

  const aggregated = useMemo(() => {
    const map = new Map<string, { code: string; name: string; t01: number; t05: number }>();
    for (const lot of allLots) {
      const existing = map.get(lot.plantType.id) ?? { code: lot.plantType.code, name: lot.plantType.name, t01: 0, t05: 0 };
      if (lot.stageCode === "T01") existing.t01 += lot.quantity;
      else if (lot.stageCode === "T05") existing.t05 += lot.quantity;
      map.set(lot.plantType.id, existing);
    }
    return Array.from(map.values());
  }, [allLots]);

  const submit = async () => {
    if (allLots.length === 0) { toast.error("Chọn/quét ít nhất 1 kệ có thành phẩm"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toRoomId: khaDungRoomId,
          notes: `Giàn kệ: ${filledShelves.map((s) => s.code).join(", ")}`,
          items: allLots.map((l) => ({ lotId: l.id, quantity: l.quantity })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã tạo phiếu bàn giao thành phẩm");
      setCreatedTransfer({ id: json.id, code: json.code, transferredAt: json.transferredAt, shelves: filledShelves });
      setRows([newRow()]);
    } finally {
      setSubmitting(false);
    }
  };

  const startNew = () => setCreatedTransfer(null);

  if (createdTransfer) {
    const slipLots = createdTransfer.shelves.flatMap((s) => s.lots);
    const slipAggregated = new Map<string, { code: string; name: string; t01: number; t05: number }>();
    for (const lot of slipLots) {
      const existing = slipAggregated.get(lot.plantType.id) ?? { code: lot.plantType.code, name: lot.plantType.name, t01: 0, t05: 0 };
      if (lot.stageCode === "T01") existing.t01 += lot.quantity;
      else if (lot.stageCode === "T05") existing.t05 += lot.quantity;
      slipAggregated.set(lot.plantType.id, existing);
    }

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="border rounded-lg bg-white p-6 print:border-none">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">PHIẾU BÀN GIAO THÀNH PHẨM</h1>
              <p className="font-mono text-info-foreground mt-1">{createdTransfer.code}</p>
            </div>
            <Badge className={PENDING_LABEL.color}>{PENDING_LABEL.label}</Badge>
          </div>
          <p className="text-sm text-text-secondary">Người bàn giao: <strong>{staffName}</strong></p>
          <p className="text-sm text-text-secondary">Thời gian: {format(new Date(createdTransfer.transferredAt), "dd/MM/yyyy HH:mm", { locale: vi })}</p>
          <p className="text-sm text-text-secondary mb-3">
            Giàn kệ: {createdTransfer.shelves.map((s) => s.code).join(", ")}
          </p>

          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[420px]">
            <thead>
              <tr>
                <th className="border px-3 py-2 text-left font-bold text-base">Mã cây</th>
                <th className="border px-3 py-2 text-left font-bold text-base">Loại cây</th>
                <th className="border px-3 py-2 text-right font-bold text-base">T01</th>
                <th className="border px-3 py-2 text-right font-bold text-base">T05</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(slipAggregated.values()).map((row) => (
                <tr key={row.code}>
                  <td className="border px-3 py-2 font-mono">{row.code}</td>
                  <td className="border px-3 py-2">{row.name}</td>
                  <td className="border px-3 py-2 text-right font-medium">{row.t01.toLocaleString("vi-VN")}</td>
                  <td className="border px-3 py-2 text-right font-medium">{row.t05.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="grid grid-cols-1 gap-6 mt-10 pt-4 text-sm text-center sm:grid-cols-2">
            <div>
              <p className="font-medium">NGƯỜI GIAO (KHO MÔ)</p>
              <p className="text-xs text-text-secondary italic">(Ký và ghi rõ họ tên)</p>
              <div className="h-20" />
              <p className="font-medium">{staffName}</p>
            </div>
            <div>
              <p className="font-medium">NGƯỜI NHẬN (KHO THÀNH PHẨM)</p>
              <p className="text-xs text-text-secondary italic">(Ký và ghi rõ họ tên)</p>
              <div className="h-20" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="outline" className="flex-1" onClick={startNew}>
            <PlusCircle className="w-4 h-4 mr-2" /> Tạo phiếu mới
          </Button>
          <PrintButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Package className="w-6 h-6 text-primary-strong" /> Bàn giao thành phẩm
        </h1>
        <p className="text-text-secondary text-sm mt-1">Quét QR hoặc chọn giàn kệ trong Phòng ra rễ để tổng hợp thành phẩm bàn giao cho Kho thành phẩm</p>
      </div>

      <Link href="/transfers/finished/list">
        <Card className="hover:bg-muted transition-colors cursor-pointer">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ClipboardList className="w-4 h-4 text-text-muted" /> Danh sách phiếu đã bàn giao
            </span>
            <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover pointer-events-none">
              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
            </Button>
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-primary-strong" />
              <div>
                <CardTitle className="text-base">Tạo phiếu bàn giao mới</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">Giàn kệ đã quét ({filledShelves.length})</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" /> Thêm hàng
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">Bấm &quot;Thêm hàng&quot; để bắt đầu</p>
            ) : (
              rows.map((row) => (
                <div key={row.rowId} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                  {row.shelf ? (
                    <>
                      <div className="flex-1">
                        <span className="font-mono font-medium text-info-foreground">{row.shelf.code}</span>
                        <span className="text-text-secondary text-sm ml-2">{row.shelf.name}</span>
                        <span className="text-xs text-text-muted ml-2">{row.shelf.lots.length} lô</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Select
                        items={pickableShelves
                          .filter((s) => !filledShelves.some((sc) => sc.id === s.id))
                          .map((s) => ({ value: s.id, label: `${s.code} — ${s.warehouseName} · ${s.roomName}` }))}
                        value=""
                        onValueChange={(v) => pickShelfForRow(row.rowId, v as string)}
                      >
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn giàn kệ..." /></SelectTrigger>
                        <SelectContent>
                          {pickableShelves
                            .filter((s) => !filledShelves.some((sc) => sc.id === s.id))
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.code} — {s.warehouseName} · {s.roomName}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="sm" onClick={() => openScannerForRow(row.rowId)}>
                        <ScanLine className="w-4 h-4 mr-1.5" /> Quét QR
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => removeRow(row.rowId)}>
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {aggregated.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Tổng hợp theo loại cây</p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Mã cây</th>
                      <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Loại cây</th>
                      <th className="text-right px-4 py-2 text-primary-strong font-bold text-base">T01</th>
                      <th className="text-right px-4 py-2 text-primary-strong font-bold text-base">T05</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregated.map((row) => (
                      <tr key={row.code} className="border-b last:border-0 even:bg-primary-light">
                        <td className="px-4 py-2 font-mono">{row.code}</td>
                        <td className="px-4 py-2">{row.name}</td>
                        <td className="px-4 py-2 text-right font-medium">{row.t01.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-2 text-right font-medium">{row.t05.toLocaleString("vi-VN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting || allLots.length === 0}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Bàn giao
          </Button>
        </CardContent>
      </Card>

      <ShelfQrScanner open={scannerOpen} onOpenChange={setScannerOpen} onScanCode={handleScan} />
    </div>
  );
}
