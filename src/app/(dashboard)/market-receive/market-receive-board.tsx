"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PackageCheck, Loader2, Check, ChevronDown, ChevronUp, AlertTriangle, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type TransferItem = {
  id: string;
  lotId: string;
  quantity: number;
  lot: { code: string; stageCode: string; plantTypeId: string; plantType: { code: string; name: string } };
};
type Transfer = {
  id: string;
  code: string;
  status: string;
  notes: string | null;
  fromWarehouse: { name: string; type: string } | null;
  fromUser: { code: string; name: string };
  transferredAt: string;
  items: TransferItem[];
};

type SplitGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; total: number };

// Đúng 3 cột đối tác vận hành tự nhập trên Phiếu nhận hàng — Đạt và Lệch đều tính tự động, không nhập.
type InputField = "customsHeld" | "actualReceived" | "failed";

export default function MarketReceiveBoard() {
  const router = useRouter();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  // key = `${transferId}:${plantTypeId}:${stageCode}:customsHeld|actualReceived|failed`
  const [splitInputs, setSplitInputs] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  // Có giá trị khi phiếu vừa xác nhận có Không đạt > 0 — hệ thống đã tự tạo 1 "nhiệm vụ" phân loại
  // Huỷ/Trồng (xem PATCH /api/transfers/[id]), hỏi NV xử lý ngay hay để sau.
  const [rejectPromptId, setRejectPromptId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transfers?status=PENDING");
      const data = await res.json();
      setTransfers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const groupKey = (plantTypeId: string, stageCode: string) => `${plantTypeId}:${stageCode}`;
  const splitKey = (transferId: string, plantTypeId: string, stageCode: string, kind: InputField) =>
    `${transferId}:${plantTypeId}:${stageCode}:${kind}`;

  const groupsFor = (t: Transfer): SplitGroup[] => {
    const map: Record<string, SplitGroup> = {};
    for (const item of t.items) {
      const key = groupKey(item.lot.plantTypeId, item.lot.stageCode);
      if (!map[key]) {
        map[key] = {
          plantTypeId: item.lot.plantTypeId,
          plantTypeCode: item.lot.plantType.code,
          plantTypeName: item.lot.plantType.name,
          stageCode: item.lot.stageCode,
          total: 0,
        };
      }
      map[key].total += item.quantity;
    }
    return Object.values(map).sort((a, b) =>
      a.plantTypeCode === b.plantTypeCode ? a.stageCode.localeCompare(b.stageCode) : a.plantTypeCode.localeCompare(b.plantTypeCode)
    );
  };

  const getInput = (t: Transfer, g: SplitGroup, kind: InputField) => splitInputs[splitKey(t.id, g.plantTypeId, g.stageCode, kind)] ?? 0;
  const setInput = (t: Transfer, g: SplitGroup, kind: InputField, value: number) =>
    setSplitInputs((prev) => ({ ...prev, [splitKey(t.id, g.plantTypeId, g.stageCode, kind)]: Math.max(0, value) }));

  // Cột 5 (Đạt) = cột 3 (Thực tế nhận) − cột 4 (Không đạt) — không cho nhập tay.
  const getPassed = (t: Transfer, g: SplitGroup) => Math.max(0, getInput(t, g, "actualReceived") - getInput(t, g, "failed"));
  // Lệch = cột 1 (Đã gửi) − cột 2 (Hải quan giữ) − cột 3 (Thực tế nhận) — phần hao hụt chưa giải thích được.
  const getDeviation = (t: Transfer, g: SplitGroup) => g.total - getInput(t, g, "customsHeld") - getInput(t, g, "actualReceived");

  const confirm = async (t: Transfer) => {
    const groups = groupsFor(t);
    const marketSplit = groups.map((g) => ({
      plantTypeId: g.plantTypeId,
      stageCode: g.stageCode,
      passedQuantity: getPassed(t, g),
      failedQuantity: getInput(t, g, "failed"),
    }));
    const customsNotes = groups
      .filter((g) => getInput(t, g, "customsHeld") > 0)
      .map((g) => `Hải quan giữ ${g.plantTypeName} ${g.stageCode}: ${getInput(t, g, "customsHeld").toLocaleString("vi-VN")}`)
      .join("; ");
    const combinedNotes = [customsNotes, receiveNotes[t.id]?.trim()].filter(Boolean).join(" — ");
    setProcessing(t.id);
    try {
      const res = await fetch(`/api/transfers/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", marketSplit, receiveNotes: combinedNotes || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận hàng");
      setExpanded(null);
      if (json.rejectClassificationId) setRejectPromptId(json.rejectClassificationId);
      loadData();
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" />
          Nhận hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">{transfers.length} phiếu chờ xác nhận</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : transfers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có phiếu hàng nào đang chờ nhận</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã phiếu</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Nguồn</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Người gửi</th>
                    <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => {
                    const groups = groupsFor(t);
                    // Không được nhận + hải quan giữ nhiều hơn số đã gửi, và Không đạt không được vượt Thực tế nhận.
                    const anyExceeds = groups.some(
                      (g) =>
                        getInput(t, g, "customsHeld") + getInput(t, g, "actualReceived") > g.total ||
                        getInput(t, g, "failed") > getInput(t, g, "actualReceived")
                    );
                    const isExpanded = expanded === t.id;

                    return (
                      <Fragment key={t.id}>
                        <tr className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="px-4 py-3 font-mono text-text-secondary">
                            {t.code}
                            <div className="text-xs text-text-muted font-sans">{format(t.transferredAt, "dd/MM/yyyy HH:mm", { locale: vi })}</div>
                          </td>
                          <td className="px-4 py-3 text-text-secondary">{t.fromWarehouse?.name}</td>
                          <td className="px-4 py-3 text-foreground">
                            {t.fromUser.name} <span className="text-xs text-text-muted font-mono">({t.fromUser.code})</span>
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
                                <><ChevronDown className="w-3.5 h-3.5 mr-1.5" /> Nhận hàng</>
                              )}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={4} className="bg-muted/30 px-4 py-4">
                              <div className="space-y-3">
                                <p className="text-xs text-text-secondary bg-info-light rounded p-2">
                                  Nhập Hải quan giữ và Thực tế nhận theo từng loại cây + quy cách — Đạt (= Thực tế nhận − Không đạt) và Lệch (= Đã gửi − Hải quan giữ − Thực tế nhận) hệ thống tự tính.
                                </p>
                                <div className="overflow-x-auto border rounded-lg bg-background">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-primary-light">
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Mã cây</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên cây</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Quy cách</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Đã gửi</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Hải quan giữ</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Thực tế nhận</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Không đạt</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Đạt</th>
                                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Lệch</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {groups.map((g) => {
                                        const deviation = getDeviation(t, g);
                                        const failedTooHigh = getInput(t, g, "failed") > getInput(t, g, "actualReceived");
                                        return (
                                          <tr key={`${g.plantTypeId}:${g.stageCode}`} className="border-b last:border-0 even:bg-primary-light">
                                            <td className="px-3 py-2 font-mono text-xs">{g.plantTypeCode}</td>
                                            <td className="px-3 py-2">{g.plantTypeName}</td>
                                            <td className="px-3 py-2 font-medium">{g.stageCode}</td>
                                            <td className="px-3 py-2">{g.total.toLocaleString("vi-VN")}</td>
                                            <td className="px-3 py-2">
                                              <Input
                                                type="number"
                                                min={0}
                                                className="w-24 h-8"
                                                value={getInput(t, g, "customsHeld") || ""}
                                                onChange={(e) => setInput(t, g, "customsHeld", parseInt(e.target.value, 10) || 0)}
                                              />
                                            </td>
                                            <td className="px-3 py-2">
                                              <Input
                                                type="number"
                                                min={0}
                                                className="w-24 h-8"
                                                value={getInput(t, g, "actualReceived") || ""}
                                                onChange={(e) => setInput(t, g, "actualReceived", parseInt(e.target.value, 10) || 0)}
                                              />
                                            </td>
                                            <td className="px-3 py-2">
                                              <Input
                                                type="number"
                                                min={0}
                                                className={`w-24 h-8 ${failedTooHigh ? "border-destructive" : ""}`}
                                                value={getInput(t, g, "failed") || ""}
                                                onChange={(e) => setInput(t, g, "failed", parseInt(e.target.value, 10) || 0)}
                                              />
                                            </td>
                                            <td className="px-3 py-2 font-medium text-primary-strong">
                                              {getPassed(t, g).toLocaleString("vi-VN")}
                                            </td>
                                            <td className="px-3 py-2 font-medium text-destructive">
                                              {deviation.toLocaleString("vi-VN")}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                {anyExceeds && (
                                  <p className="text-sm text-destructive flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4" /> Hải quan giữ + Thực tế nhận không được vượt quá số đã gửi, và Không đạt không được vượt quá Thực tế nhận.
                                  </p>
                                )}
                                <div className="space-y-1">
                                  <label className="text-sm text-text-secondary">Ghi chú hao hụt (tuỳ chọn)</label>
                                  <textarea
                                    rows={2}
                                    value={receiveNotes[t.id] ?? ""}
                                    onChange={(e) => setReceiveNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                    className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-primary hover:bg-primary-hover"
                                    onClick={() => confirm(t)}
                                    disabled={processing === t.id || anyExceeds}
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

      <Dialog open={!!rejectPromptId} onOpenChange={(v) => { if (!v) setRejectPromptId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-warning" />
              Cần phân loại hàng không đạt
            </DialogTitle>
            <DialogDescription>
              Phiếu vừa nhận có hàng Không đạt — cần đề xuất Huỷ/Trồng (kèm ảnh) để NV bán hàng phụ trách
              kho duyệt. Bạn có thể xử lý ngay hoặc để sau (hệ thống đã tự tạo nhiệm vụ, tìm lại ở &ldquo;Phân
              loại hàng không đạt&rdquo;).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectPromptId(null)}>Để sau</Button>
            <Button
              className="bg-primary hover:bg-primary-hover"
              onClick={() => { if (rejectPromptId) router.push(`/market-receive/reject-classification/${rejectPromptId}`); }}
            >
              Tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
