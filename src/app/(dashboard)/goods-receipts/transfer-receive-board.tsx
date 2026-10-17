"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PackageCheck, Loader2, Check, X, ChevronDown, ChevronUp, AlertTriangle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { SURPLUS_TRANSFER_TAG, sumLotQuantity } from "@/types";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";
import QualityDefectLegend from "@/components/shared/quality-defect-legend";
import { QUALITY_DEFECT_COUNT, emptyDefects, sumDefects } from "@/lib/quality-defects";

type Shelf = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  capacity: number | null;
  assignedStaffId?: string | null;
  plantType: { id: string; code: string; name: string } | null;
  lots: { quantity: number; stageCode: string }[];
};
type TransferItem = {
  id: string;
  lotId: string;
  quantity: number;
  lot: { code: string; stage: string; stageCode: string; plantTypeId: string; plantType: { code: string; name: string } };
};
type Transfer = {
  id: string;
  code: string;
  status: string;
  notes: string | null;
  fromUser: { code: string; name: string };
  fromWarehouse: { name: string; type: string } | null;
  fromRoom: { name: string; type: string } | null;
  toWarehouse: { type: string; shelves: Shelf[]; rooms: { id: string; name: string; type: string }[] };
  toRoom: { shelves: Shelf[] } | null;
  transferredAt: string;
  items: TransferItem[];
  assignedTo: { id: string; code: string; name: string } | null;
  assignmentConfirmedAt: string | null;
};

export default function TransferReceiveBoard() {
  const { data: session } = useSession();
  const canAssign = session?.user?.role === "QUAN_LY_KHO_THANH_PHAM" || session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [staffOptions, setStaffOptions] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shelfMap, setShelfMap] = useState<Record<string, string>>({});
  // Đánh giá chất lượng lúc nhận thành phẩm từ Phòng ra rễ — số lượng [Lỗi 1..Lỗi 5] theo từng loại cây + quy
  // cách (xem src/lib/quality-defects.ts); tổng lỗi → Phòng chờ xử lý, còn lại → Phòng đạt tiêu chuẩn (server
  // tự chia, xem qualityChecks ở PATCH /api/transfers/[id]). key = transferId:plantTypeId:stageCode.
  const [defectInputs, setDefectInputs] = useState<Record<string, number[]>>({});
  // Góp ý gửi NV Kho mô + NV Kỹ thuật khu sản xuất nguồn (không bắt buộc) — key = transferId.
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tRes = await fetch("/api/transfers?status=PENDING");
      const tData = await tRes.json();
      setTransfers(Array.isArray(tData) ? tData : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Danh sách NV kho thành phẩm để Quản lý chọn giao việc — chỉ tải khi thật sự có quyền gán, không tải
  // thừa cho NV kho thành phẩm thường.
  useEffect(() => {
    if (!canAssign) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: { id: string; code: string; name: string; role: string }[]) => {
        setStaffOptions((Array.isArray(data) ? data : []).filter((u) => u.role === "KHO_THANH_PHAM").map((u) => ({ id: u.id, code: u.code, name: u.name })));
      });
  }, [canAssign]);

  const confirm = async (
    transferId: string,
    items: TransferItem[],
    mode: "auto" | "manual" | "noShelf" | "split",
    isSurplus: boolean,
    qualityChecks?: { plantTypeId: string; stageCode: string; defectQuantities: number[] }[],
    receiveFeedback?: string
  ) => {
    const assignments = mode === "manual"
      ? items.map((item) => ({ lotId: item.lotId, shelfId: shelfMap[item.lotId] ?? "" }))
      : [];
    setProcessing(transferId);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          shelfAssignments: assignments,
          ...(mode === "split" ? { qualityChecks, ...(receiveFeedback?.trim() ? { receiveFeedback: receiveFeedback.trim() } : {}) } : {}),
        }),
      });
      // Server lỗi 500 (VD transaction quá hạn) trả về body không phải JSON — không được để res.json() ném
      // lỗi nuốt mất thông báo, người dùng phải luôn biết thao tác thành công hay thất bại.
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Xác nhận nhận hàng thất bại — vui lòng thử lại"); return; }
      if (mode === "auto" && Array.isArray(json.placements)) {
        const lines = json.placements.map((p: { lotCode: string; shelfCode: string; quantity: number; pool: string }) =>
          `${p.lotCode} → ${p.shelfCode} (${p.quantity.toLocaleString("vi-VN")}${
            isSurplus ? "" : p.pool === "SHARED" ? ", dư sang Kho chung" : ""
          })`
        );
        toast.success(isSurplus ? "Đã xếp MM dư vào Kho quá hạn" : "Đã xếp kệ tự động", { description: lines.join(" · ") });
      } else {
        toast.success(receiveFeedback?.trim() ? "Đã xác nhận nhận hàng và gửi góp ý cho Kho mô / NV Kỹ thuật" : "Đã xác nhận nhận hàng");
      }
      setExpanded(null);
      loadData();
    } catch {
      toast.error("Không kết nối được máy chủ — vui lòng thử lại");
    } finally { setProcessing(null); }
  };

  const reject = async (transferId: string) => {
    setProcessing(transferId);
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã từ chối bàn giao");
      setExpanded(null);
      loadData();
    } catch {
      toast.error("Không kết nối được máy chủ — vui lòng thử lại");
    } finally { setProcessing(null); }
  };

  // Phiếu gửi tới Kho thị trường (Đối tác vận hành quản lý) không hiện ở đây — bên nhận là Đối tác vận
  // hành (xem /market-receive), không phải Kho thành phẩm, dù Kho thành phẩm là người tạo phiếu.
  const pendingTransfers = transfers.filter((t) => t.status === "PENDING" && t.toWarehouse?.type !== "THI_TRUONG");

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{pendingTransfers.length} phiếu chờ xác nhận</p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : pendingTransfers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có phiếu bàn giao nào đang chờ</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên nhân viên</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Nguồn</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Giao cho</th>
                    <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTransfers.map((t) => {
                    const isToFinishedWarehouse = t.toWarehouse?.type === "THANH_PHAM";
                    // Bàn giao thành phẩm từ Phòng ra rễ → cần chia số lượng theo loại cây + quy cách vào Phòng
                    // đạt tiêu chuẩn/Phòng chờ xử lý. Luân chuyển nội bộ giữa các phòng KTP đã có sẵn 1 phòng đích cụ thể.
                    const isExternalFinishedHandoff = isToFinishedWarehouse && t.fromRoom?.type === "PHONG_RA_RE";
                    const isSurplus = t.notes === SURPLUS_TRANSFER_TAG;
                    const isAuto = isSurplus || t.fromRoom?.type === "PHONG_TOI";
                    const mode: "auto" | "manual" | "noShelf" | "split" = isExternalFinishedHandoff
                      ? "split"
                      : isToFinishedWarehouse
                        ? "noShelf"
                        : isAuto
                          ? "auto"
                          : "manual";

                    const datRoom = t.toWarehouse?.rooms.find((r) => r.type === "PHONG_DAT_TIEU_CHUAN");
                    const choXuLyRoom = t.toWarehouse?.rooms.find((r) => r.type === "PHONG_CHO_XU_LY");
                    // Chia riêng theo TỪNG loại cây + quy cách — không được gộp nhiều loại cây lại rồi chia
                    // theo tổng quy cách (VD 2 loại cây cùng có T01 phải tách 2 dòng riêng).
                    type SplitGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; total: number };
                    const groupMap = isExternalFinishedHandoff
                      ? t.items.reduce<Record<string, SplitGroup>>((acc, item) => {
                          const key = `${item.lot.plantTypeId}:${item.lot.stageCode}`;
                          if (!acc[key]) {
                            acc[key] = {
                              plantTypeId: item.lot.plantTypeId,
                              plantTypeCode: item.lot.plantType.code,
                              plantTypeName: item.lot.plantType.name,
                              stageCode: item.lot.stageCode,
                              total: 0,
                            };
                          }
                          acc[key].total += item.quantity;
                          return acc;
                        }, {})
                      : {};
                    const groups = Object.values(groupMap).sort((a, b) =>
                      a.plantTypeCode === b.plantTypeCode ? a.stageCode.localeCompare(b.stageCode) : a.plantTypeCode.localeCompare(b.plantTypeCode)
                    );
                    const defectKey = (g: SplitGroup) => `${t.id}:${g.plantTypeId}:${g.stageCode}`;
                    const getDefects = (g: SplitGroup) => defectInputs[defectKey(g)] ?? emptyDefects();
                    const setDefect = (g: SplitGroup, idx: number, value: number) =>
                      setDefectInputs((prev) => ({ ...prev, [defectKey(g)]: getDefects(g).map((v, j) => (j === idx ? value : v)) }));
                    const defectTotal = (g: SplitGroup) => sumDefects(getDefects(g));
                    const allMatched = datRoom && choXuLyRoom && groups.length > 0 && groups.every((g) => defectTotal(g) <= g.total);

                    const submitSplit = () => {
                      if (!datRoom || !choXuLyRoom) return;
                      confirm(t.id, t.items, "split", false, groups.map((g) => ({
                        plantTypeId: g.plantTypeId, stageCode: g.stageCode, defectQuantities: getDefects(g),
                      })), feedbackInputs[t.id]);
                    };

                    const isExpanded = expanded === t.id;

                    return (
                      <Fragment key={t.id}>
                        <tr className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-3 font-mono text-text-secondary">
                            {t.code}
                            <div className="text-xs text-text-muted font-sans">{format(t.transferredAt, "dd/MM/yyyy HH:mm", { locale: vi })}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-text-secondary">{t.fromUser.code}</td>
                          <td className="px-4 py-3 text-foreground">{t.fromUser.name}</td>
                          <td className="px-4 py-3 text-text-secondary">
                            {t.fromWarehouse?.name}{t.fromRoom ? ` — ${t.fromRoom.name}` : ""}
                          </td>
                          <td className="px-4 py-3">
                            <KhoTpAssignCell
                              endpoint={`/api/transfers/${t.id}`}
                              assignedTo={t.assignedTo}
                              staffOptions={staffOptions}
                              canAssign={canAssign}
                              confirmedAt={t.assignmentConfirmedAt}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant={isExpanded ? "ghost" : "default"}
                              size="sm"
                              className={isExpanded ? "h-8" : "h-8 bg-primary hover:bg-primary-hover"}
                              onClick={() => setExpanded(isExpanded ? null : t.id)}
                            >
                              {isExpanded ? (
                                <><ChevronUp className="w-3.5 h-3.5 mr-1.5" /> Thu gọn</>
                              ) : (
                                <><ChevronDown className="w-3.5 h-3.5 mr-1.5" /> {isExternalFinishedHandoff ? "Phân loại hàng" : "Xác nhận bàn giao"}</>
                              )}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-muted/30 px-4 py-4">
                              <div className="space-y-3">
                                {isExternalFinishedHandoff ? (
                                  <>
                                    <p className="text-xs text-text-secondary">
                                      Đánh giá chất lượng theo từng mã cây + quy cách: điền số cây mỗi loại lỗi. Tổng lỗi tự vào {choXuLyRoom?.name ?? "Phòng chờ xử lý"}, phần còn lại tự vào {datRoom?.name ?? "Phòng đạt tiêu chuẩn"}.
                                    </p>
                                    <QualityDefectLegend />
                                    {!datRoom || !choXuLyRoom ? (
                                      <p className="text-sm text-destructive flex items-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4" /> Chưa có đủ Phòng đạt tiêu chuẩn / Phòng chờ xử lý trong kho thành phẩm — liên hệ Admin tạo phòng.
                                      </p>
                                    ) : (
                                      <div className="overflow-x-auto border rounded-lg bg-background">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="bg-primary-light">
                                              <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                                              <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                                              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Tổng theo phiếu</th>
                                              {Array.from({ length: QUALITY_DEFECT_COUNT }, (_, i) => (
                                                <th key={i} className="text-left px-2 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Lỗi {i + 1}</th>
                                              ))}
                                              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">{choXuLyRoom.name}</th>
                                              <th className="text-right px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">{datRoom.name}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {groups.map((g) => {
                                              const defects = getDefects(g);
                                              const over = defectTotal(g) > g.total;
                                              return (
                                                <tr key={`${g.plantTypeId}:${g.stageCode}`} className="border-b last:border-0 even:bg-primary-light">
                                                  <td className="px-3 py-2 font-mono">{g.plantTypeCode}</td>
                                                  <td className="px-3 py-2 font-medium">{g.stageCode}</td>
                                                  <td className="px-3 py-2 text-right tabular-nums">{g.total.toLocaleString("vi-VN")}</td>
                                                  {defects.map((v, i) => (
                                                    <td key={i} className="px-2 py-2">
                                                      <Input
                                                        type="number"
                                                        min={0}
                                                        className="w-16 h-8"
                                                        placeholder="0"
                                                        value={v || ""}
                                                        onChange={(e) => setDefect(g, i, Math.max(0, parseInt(e.target.value, 10) || 0))}
                                                      />
                                                    </td>
                                                  ))}
                                                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${over ? "text-destructive" : "text-foreground"}`}>
                                                    {defectTotal(g).toLocaleString("vi-VN")}
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-medium tabular-nums text-primary-strong">
                                                    {over ? "—" : (g.total - defectTotal(g)).toLocaleString("vi-VN")}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                    {datRoom && choXuLyRoom && !allMatched && (
                                      <p className="text-sm text-destructive flex items-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4" /> Tổng lỗi vượt quá số lượng theo phiếu ở dòng tô đỏ — vui lòng kiểm tra lại.
                                      </p>
                                    )}
                                    <div className="space-y-1">
                                      <label htmlFor={`feedback-${t.id}`} className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                        <MessageSquare className="w-4 h-4 text-primary-strong" /> Góp ý cho Kho mô / NV Kỹ thuật
                                        <span className="text-xs font-normal text-text-muted">(không bắt buộc)</span>
                                      </label>
                                      <textarea
                                        id={`feedback-${t.id}`}
                                        value={feedbackInputs[t.id] ?? ""}
                                        onChange={(e) => setFeedbackInputs((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                        maxLength={2000}
                                        rows={3}
                                        placeholder="VD: nhiều túi rễ ngắn, lá vàng ở AL003 — đề nghị kiểm tra lại trước khi bàn giao..."
                                        className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                      />
                                      <p className="text-xs text-text-muted">Có nội dung thì khi xác nhận, hệ thống gửi thông báo cho NV Kho mô và NV Kỹ thuật của {t.fromWarehouse?.name ?? "khu sản xuất"}.</p>
                                    </div>
                                  </>
                                ) : isToFinishedWarehouse ? (
                                  <p className="text-xs text-text-secondary bg-info-light rounded p-2">
                                    Kho thành phẩm không quản lý theo giàn kệ — xác nhận nhận thẳng vào phòng đích, không cần chọn kệ.
                                  </p>
                                ) : isAuto ? (
                                  <p className="text-xs text-text-secondary bg-info-light rounded p-2">
                                    {isSurplus
                                      ? "Bàn giao MM dư (chỉ định đã kết thúc do hết thời gian) — hệ thống tự xếp thẳng vào Kho quá hạn trong Kho mẫu mẹ chung."
                                      : "Bàn giao từ Phòng tối — hệ thống tự xếp kệ: mẫu mẹ (M05) vào đúng kệ của nhân viên phụ trách trong Kho mẫu mẹ đã chia (dư quá sức chứa kệ sẽ tự chuyển sang Kho đúng hạn), cây ra rễ vào Phòng ra rễ."}
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-sm font-medium text-foreground">Phân bổ kệ cho từng lô:</p>
                                    {t.items.map((item) => {
                                      const allShelves = t.toRoom?.shelves ?? t.toWarehouse.shelves;
                                      // Chỉ gợi ý kệ chưa gán loại cây hoặc đã gán đúng loại cây của lô này, và còn đủ chỗ
                                      // (đơn vị theo room type — cây ở Phòng ra rễ, cụm ở Phòng mẫu mẹ).
                                      const itemUnits = item.quantity;
                                      const compatibleShelves = allShelves.filter((s) => {
                                        const used = sumLotQuantity(s.lots);
                                        const matchesPlantType = !s.plantType || s.plantType.id === item.lot.plantTypeId;
                                        const hasRoom = !s.capacity || used + itemUnits <= s.capacity;
                                        return matchesPlantType && hasRoom;
                                      });
                                      return (
                                        <div key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
                                          <div className="min-w-0 flex-1">
                                            <span className="font-mono text-info-foreground">{item.lot.code}</span>
                                            <span className="text-text-secondary ml-2">{item.lot.plantType.name}</span>
                                            <Badge variant="secondary" className="ml-2 text-xs">{item.lot.stage === "MAU_ME" ? "MM" : "TP"}</Badge>
                                            <span className="ml-2 font-medium">
                                              {item.quantity.toLocaleString("vi-VN")} {item.lot.stage === "MAU_ME" ? "cụm" : "cây"}
                                            </span>
                                          </div>
                                          <Select
                                            items={compatibleShelves.map((s) => {
                                              const used = sumLotQuantity(s.lots);
                                              return {
                                                value: s.id,
                                                label: `${s.code} — ${s.name}${s.capacity ? ` (còn ${(s.capacity - used).toLocaleString("vi-VN")}/${s.capacity})` : ""}`,
                                              };
                                            })}
                                            value={shelfMap[item.lotId] ?? null}
                                            onValueChange={(v) => setShelfMap((prev) => ({ ...prev, [item.lotId]: v as string }))}
                                          >
                                            <SelectTrigger className="w-full sm:w-52">
                                              <SelectValue placeholder={compatibleShelves.length > 0 ? "Chọn kệ" : "Không có kệ phù hợp"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {compatibleShelves.map((s) => {
                                                const used = sumLotQuantity(s.lots);
                                                return (
                                                  <SelectItem key={s.id} value={s.id}>
                                                    {s.code} — {s.name}{s.capacity ? ` (còn ${(s.capacity - used).toLocaleString("vi-VN")}/${s.capacity})` : ""}
                                                  </SelectItem>
                                                );
                                              })}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      );
                                    })}
                                  </>
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => reject(t.id)}
                                    disabled={processing === t.id}
                                  >
                                    <X className="w-4 h-4 mr-1" /> Từ chối
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-primary hover:bg-primary-hover"
                                    onClick={() => (mode === "split" ? submitSplit() : confirm(t.id, t.items, mode, isSurplus))}
                                    disabled={processing === t.id || (mode === "split" && !allMatched)}
                                  >
                                    {processing === t.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                                    Xác nhận nhận hàng
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
