"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, Download, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type ImportError = { row: number; message: string };
type PreviewRow = {
  row: number;
  managerCode: string;
  salesCode: string;
  marketCode: string;
  managerName: string;
  salesName: string;
  marketName: string;
  currentManagerName: string | null;
  change: "new" | "update" | "same";
};
type ImportRequest = {
  id: string;
  fileName: string;
  rowCount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
  createdBy: { name: string };
  decidedBy: { name: string } | null;
  preview?: PreviewRow[];
  errors?: ImportError[];
};

const STATUS: Record<ImportRequest["status"], { label: string; cls: string }> = {
  PENDING: { label: "Chờ Admin cấp cao duyệt", cls: "bg-warning-light text-warning-foreground" },
  APPROVED: { label: "Đã duyệt", cls: "bg-primary-light text-primary-strong" },
  REJECTED: { label: "Từ chối", cls: "bg-danger-light text-destructive" },
};
const CHANGE: Record<PreviewRow["change"], { label: string; cls: string }> = {
  new: { label: "Thêm mới", cls: "bg-info-light text-info-foreground" },
  update: { label: "Đổi quản lý", cls: "bg-warning-light text-warning-foreground" },
  same: { label: "Không đổi", cls: "bg-muted text-text-secondary" },
};
const fmt = (s: string) => format(new Date(s), "HH:mm dd/MM/yyyy");

function ErrorList({ errors }: { errors: ImportError[] }) {
  return (
    <ul className="max-h-60 overflow-y-auto space-y-1 text-sm">
      {errors.map((e, i) => (
        <li key={i} className="text-destructive">{e.row ? `Dòng ${e.row}: ` : ""}{e.message}</li>
      ))}
    </ul>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const shown = rows.filter((r) => r.change !== "same");
  return (
    <div className="overflow-x-auto max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-primary-light sticky top-0">
          <tr>
            <th className="text-left px-2 py-1.5 text-base text-primary-strong font-bold">NV bán hàng</th>
            <th className="text-left px-2 py-1.5 text-base text-primary-strong font-bold">Thị trường</th>
            <th className="text-left px-2 py-1.5 text-base text-primary-strong font-bold">NV quản lý</th>
            <th className="text-left px-2 py-1.5 text-base text-primary-strong font-bold">Thay đổi</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.row} className="border-b border-divider last:border-0">
              <td className="px-2 py-1.5">{r.salesName} <span className="text-text-muted">({r.salesCode})</span></td>
              <td className="px-2 py-1.5">{r.marketName}</td>
              <td className="px-2 py-1.5">
                {r.change === "update" && <span className="text-text-muted line-through mr-1">{r.currentManagerName}</span>}
                {r.managerName}
              </td>
              <td className="px-2 py-1.5"><Badge className={CHANGE[r.change].cls}>{CHANGE[r.change].label}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && <p className="text-xs text-text-muted px-2 py-1">{rows.length - shown.length} dòng không thay đổi so với hiện tại.</p>}
    </div>
  );
}

export default function ManagersImportPanel({ isSuperAdmin, onApplied }: { isSuperAdmin: boolean; onApplied: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<ImportError[] | null>(null);
  const [requests, setRequests] = useState<ImportRequest[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ImportRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    fetch("/api/sales-manager-assignments/import-requests")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [reloadKey]);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadErrors(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/sales-manager-assignments/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      toast.error(json.message ?? "Tải lên thất bại");
      if (json.errors?.length) setUploadErrors(json.errors);
      return;
    }
    toast.success(json.message);
    if (json.applied) onApplied();
    setReloadKey((k) => k + 1);
  };

  const decide = async (req: ImportRequest, action: "approve" | "reject", note?: string) => {
    setBusyId(req.id);
    const res = await fetch(`/api/sales-manager-assignments/import-requests/${req.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { toast.error(json.message ?? "Thao tác thất bại"); return false; }
    toast.success(json.message);
    if (action === "approve") onApplied();
    setReloadKey((k) => k + 1);
    return true;
  };

  const pending = requests.filter((r) => r.status === "PENDING");
  const history = requests.filter((r) => r.status !== "PENDING").slice(0, 5);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.location.assign("/api/sales-manager-assignments/import")}>
            <Download className="w-4 h-4" /> Tải file Excel mẫu
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          />
          <Button size="sm" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Tải file Excel lên
          </Button>
          <p className="text-xs text-text-muted basis-full">
            File mẫu có sẵn phân công hiện tại. Dòng trong file: thêm mới hoặc đổi NV quản lý; phân công không có trong file giữ nguyên.
            File có lỗi sẽ không được tải lên.{!isSuperAdmin && " Thay đổi chỉ áp dụng sau khi Admin cấp cao duyệt."}
          </p>
          {uploadErrors && (
            <div className="basis-full rounded-lg bg-danger-light px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-destructive">File có {uploadErrors.length} lỗi — chưa tải lên:</p>
                <Button size="icon" variant="ghost" onClick={() => setUploadErrors(null)}><X className="w-4 h-4" /></Button>
              </div>
              <ErrorList errors={uploadErrors} />
            </div>
          )}
        </CardContent>
      </Card>

      {pending.map((r) => (
        <Card key={r.id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Yêu cầu nhập file &quot;{r.fileName}&quot;</CardTitle>
              <p className="text-xs text-text-secondary">{r.createdBy.name} gửi lúc {fmt(r.createdAt)} · {r.rowCount} dòng</p>
            </div>
            <Badge className={STATUS[r.status].cls}>{STATUS[r.status].label}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.errors?.length ? (
              <div className="rounded-lg bg-danger-light px-3 py-2">
                <p className="text-sm font-semibold text-destructive">Dữ liệu đã thay đổi từ lúc gửi — {r.errors.length} dòng không còn hợp lệ:</p>
                <ErrorList errors={r.errors} />
              </div>
            ) : null}
            {r.preview && <PreviewTable rows={r.preview} />}
            {isSuperAdmin && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={busyId === r.id} onClick={() => { setRejectNote(""); setRejecting(r); }}>
                  <X className="w-4 h-4" /> Từ chối
                </Button>
                <Button size="sm" disabled={busyId === r.id || !!r.errors?.length} onClick={() => decide(r, "approve")}>
                  {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Duyệt và áp dụng
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {history.length > 0 && (
        <div className="text-sm space-y-1">
          <p className="font-semibold text-text-secondary">Yêu cầu nhập file gần đây</p>
          {history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-text-secondary">
              <Badge className={STATUS[r.status].cls}>{STATUS[r.status].label}</Badge>
              <span>&quot;{r.fileName}&quot; — {r.createdBy.name}, {fmt(r.createdAt)}</span>
              {r.decidedBy && <span>· {r.decidedBy.name} {r.decidedAt ? fmt(r.decidedAt) : ""}</span>}
              {r.note && <span className="text-destructive">· {r.note}</span>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o && !busyId) setRejecting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Từ chối yêu cầu nhập file</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Lý do (không bắt buộc)</Label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={!!busyId}>Huỷ</Button>
            <Button
              disabled={!!busyId}
              onClick={async () => { if (rejecting && (await decide(rejecting, "reject", rejectNote))) setRejecting(null); }}
            >
              {busyId && <Loader2 className="w-4 h-4 animate-spin" />} Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
