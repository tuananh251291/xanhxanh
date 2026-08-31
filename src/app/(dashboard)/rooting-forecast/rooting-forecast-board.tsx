"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { Loader2, Trash2, Plus, Send, AlertTriangle, PenLine } from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";

type ForecastEntryRow = {
  entryId: string;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  assignedStaffId: string; staffCode: string; staffName: string;
  quantity: number;
};
type AvailableStaff = { id: string; code: string; name: string };
type PlantType = { id: string; code: string; name: string };
type ForecastStatus = {
  taskMonth: string;
  deadline: string;
  entries: ForecastEntryRow[];
  availableStaff: AvailableStaff[];
  isLocked: boolean;
  completedAt: string | null;
  isOnTime: boolean | null;
};
type ComboOption = { value: string; label: string };

type ProposalItem = { id: string; plantTypeId: string; quantity: number; plantType: { code: string; name: string }; assignedStaff: { code: string; name: string } };
type Proposal = {
  id: string; taskMonth: string; reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null; createdAt: string; reviewedAt: string | null;
  warehouse: { code: string; name: string };
  requestedBy: { code: string; name: string };
  reviewedBy: { code: string; name: string } | null;
  items: ProposalItem[];
};

const DEFAULT_BLANK_ROWS = 10;

type DraftRow = { key: string; plantTypeOption: ComboOption | null; staffOption: ComboOption | null; quantity: string };

function newDraftRow(): DraftRow {
  return { key: `draft-${Math.random().toString(36).slice(2)}`, plantTypeOption: null, staffOption: null, quantity: "" };
}

function StatusBadge({ status }: { status: ForecastStatus }) {
  const deadline = new Date(status.deadline);
  const isPastDeadline = new Date() >= deadline;

  if (status.isLocked) {
    return status.isOnTime ? (
      <Badge variant="completed">Đã hoàn thành — Đúng hạn</Badge>
    ) : (
      <Badge variant="overdue">Đã hoàn thành — Trễ hạn</Badge>
    );
  }
  return isPastDeadline ? (
    <Badge variant="overdue">Quá hạn — Chưa hoàn thành</Badge>
  ) : (
    <Badge variant="info">Đang chờ nhập</Badge>
  );
}

function ProposalStatusBadge({ status }: { status: Proposal["status"] }) {
  if (status === "APPROVED") return <Badge variant="completed">Đã duyệt</Badge>;
  if (status === "REJECTED") return <Badge variant="overdue">Từ chối</Badge>;
  return <Badge variant="info">Chờ duyệt</Badge>;
}

// 1 bảng dòng (mã cây / NV cấy mô / số lượng / xoá) dùng chung cho cả form nộp lần đầu lẫn form đề xuất
// chỉnh sửa — khác nhau ở dữ liệu rows/setRows truyền vào.
function EntryRowsTable({
  rows, setRows, plantTypeOptions, staffOptions,
}: {
  rows: DraftRow[];
  setRows: React.Dispatch<React.SetStateAction<DraftRow[]>>;
  plantTypeOptions: ComboOption[];
  staffOptions: ComboOption[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light text-primary-strong">
            <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
            <th className="px-3 py-2 text-left font-bold text-base">NV cấy mô</th>
            <th className="px-3 py-2 text-center font-bold text-base">Số lượng dự kiến</th>
            <th className="px-3 py-2 text-center font-bold text-base">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b even:bg-primary-light">
              <td className="px-2 py-2">
                <Combobox
                  items={plantTypeOptions}
                  value={row.plantTypeOption}
                  isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                  onValueChange={(val) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, plantTypeOption: val as ComboOption | null } : r)))}
                >
                  <ComboboxInputGroup className="w-52 h-9">
                    <ComboboxInput placeholder="Gõ mã/tên cây…" />
                    <ComboboxTrigger />
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </td>
              <td className="px-2 py-2">
                <Combobox
                  items={staffOptions}
                  value={row.staffOption}
                  isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                  onValueChange={(val) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, staffOption: val as ComboOption | null } : r)))}
                >
                  <ComboboxInputGroup className="w-52 h-9">
                    <ComboboxInput placeholder="Gõ mã/tên NV…" />
                    <ComboboxTrigger />
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </td>
              <td className="px-2 py-2">
                <Input
                  type="number" min={0}
                  placeholder="Số lượng"
                  value={row.quantity}
                  onChange={(ev) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, quantity: ev.target.value } : r)))}
                  className="w-28 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </td>
              <td className="px-3 py-2 text-center">
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Lọc còn các dòng ĐÃ ĐIỀN ĐỦ 3 trường, báo lỗi nếu có dòng điền dở (1-2 trong 3 trường) — dòng trống hoàn
// toàn thì bỏ qua coi như chưa dùng tới.
function collectValidRows(rows: DraftRow[]): { plantTypeId: string; assignedStaffId: string; quantity: number }[] | null {
  const result: { plantTypeId: string; assignedStaffId: string; quantity: number }[] = [];
  for (const row of rows) {
    const filledCount = [row.plantTypeOption, row.staffOption, row.quantity.trim() !== ""].filter(Boolean).length;
    if (filledCount === 0) continue;
    if (filledCount < 3 || !row.plantTypeOption || !row.staffOption) {
      toast.error("Có dòng điền chưa đủ (thiếu mã cây/NV cấy mô/số lượng) — điền đủ hoặc xoá dòng đó");
      return null;
    }
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error("Số lượng phải là số nguyên, không âm");
      return null;
    }
    result.push({ plantTypeId: row.plantTypeOption.value, assignedStaffId: row.staffOption.value, quantity });
  }
  return result;
}

export default function RootingForecastBoard() {
  const [status, setStatus] = useState<ForecastStatus | null>(null);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [myProposals, setMyProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => Array.from({ length: DEFAULT_BLANK_ROWS }, newDraftRow));
  const [submitting, setSubmitting] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editRows, setEditRows] = useState<DraftRow[]>(() => [newDraftRow()]);
  const [editReason, setEditReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusRes, plantTypesRes, proposalsRes] = await Promise.all([
        fetch("/api/rooting-forecast"),
        fetch("/api/plant-types"),
        fetch("/api/rooting-forecast-edit-proposals"),
      ]);
      const statusData = await statusRes.json();
      if (!statusRes.ok) {
        setError(statusData?.message ?? "Không tải được dữ liệu");
        return;
      }
      setStatus(statusData);
      const plantTypesData = await plantTypesRes.json();
      setPlantTypes(Array.isArray(plantTypesData) ? plantTypesData : []);
      const proposalsData = await proposalsRes.json();
      setMyProposals(Array.isArray(proposalsData) ? proposalsData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const plantTypeOptions: ComboOption[] = useMemo(() => plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })), [plantTypes]);
  const staffOptions: ComboOption[] = useMemo(
    () => (status?.availableStaff ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [status]
  );

  const submitAll = async () => {
    const items = collectValidRows(draftRows);
    if (items === null) return;
    if (items.length === 0) { toast.error("Chưa điền dòng nào"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooting-forecast/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message ?? "Lưu thất bại"); return; }
      setStatus(data);
      toast.success("Đã lưu — không thể chỉnh sửa nữa, dùng \"Đề xuất chỉnh sửa\" nếu cần sửa sau này");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEditProposal = async () => {
    if (editReason.trim() === "") { toast.error("Cần nhập lý do"); return; }
    const items = collectValidRows(editRows);
    if (items === null) return;
    if (items.length === 0) { toast.error("Chưa điền dòng nào"); return; }
    setEditSubmitting(true);
    try {
      const res = await fetch("/api/rooting-forecast-edit-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: editReason.trim(), items }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.message ?? "Gửi đề xuất thất bại"); return; }
      toast.success("Đã gửi đề xuất — chờ Admin duyệt");
      setEditMode(false);
      setEditRows([newDraftRow()]);
      setEditReason("");
      load();
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }
  if (error) {
    return <Card><CardContent className="py-12 text-center text-text-secondary">{error}</CardContent></Card>;
  }
  if (!status) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-text-secondary">
              Đang dự kiến sản lượng cho <strong className="text-primary-strong">THÁNG SAU — tháng {format(addMonths(new Date(status.taskMonth), 1), "MM/yyyy")}</strong>
              {" "}· Hạn hoàn thành (của tháng hiện tại): <strong className="text-foreground">{format(new Date(status.deadline), "dd/MM/yyyy")}</strong>
            </p>
            <StatusBadge status={status} />
          </div>

          {status.availableStaff.length === 0 && (
            <p className="text-sm text-warning-foreground bg-warning-light rounded-md px-3 py-2">
              Cơ sở sản xuất của bạn hiện chưa có NV cấy mô nào — cần Admin cấp cao gán NV cấy mô vào cơ sở
              này trước khi gắn được với từng mã cây.
            </p>
          )}

          {!status.isLocked ? (
            <>
              <div className="flex items-start gap-2 text-sm text-destructive bg-danger-light rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Lưu ý:</strong> bạn chỉ được nhập <strong>MỘT LẦN</strong> và không thể thay đổi
                  sau khi lưu — hãy kiểm tra kỹ trước khi bấm &quot;Lưu tất cả&quot;. Muốn sửa sau khi đã
                  lưu phải gửi Đề xuất chỉnh sửa cho Admin duyệt.
                </p>
              </div>

              <EntryRowsTable rows={draftRows} setRows={setDraftRows} plantTypeOptions={plantTypeOptions} staffOptions={staffOptions} />

              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setDraftRows((prev) => [...prev, newDraftRow()])}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm dòng
                </Button>
                <Button type="button" size="sm" disabled={submitting} onClick={submitAll} className="bg-primary hover:bg-primary-hover">
                  {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                  Lưu tất cả
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light text-primary-strong">
                      <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
                      <th className="px-3 py-2 text-left font-bold text-base">NV cấy mô</th>
                      <th className="px-3 py-2 text-center font-bold text-base">Số lượng dự kiến</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.entries.map((e) => (
                      <tr key={e.entryId} className="border-b last:border-0 even:bg-primary-light">
                        <td className="px-3 py-2 font-mono">{e.plantTypeCode} — {e.plantTypeName}</td>
                        <td className="px-3 py-2 text-text-secondary">{e.staffCode} — {e.staffName}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{e.quantity.toLocaleString("vi-VN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button type="button" variant="outline" size="sm" onClick={() => setEditMode((v) => !v)}>
                <PenLine className="w-3.5 h-3.5 mr-1.5" /> {editMode ? "Đóng form đề xuất" : "Đề xuất chỉnh sửa"}
              </Button>

              {editMode && (
                <div className="space-y-3 border border-border rounded-lg p-3">
                  <p className="text-sm text-text-secondary">
                    Thêm dòng mới hoặc dòng cần sửa số lượng — gửi Admin duyệt, chỉ khi Admin Duyệt thì dữ
                    liệu chính mới thực sự thay đổi.
                  </p>
                  <EntryRowsTable rows={editRows} setRows={setEditRows} plantTypeOptions={plantTypeOptions} staffOptions={staffOptions} />
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditRows((prev) => [...prev, newDraftRow()])}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm dòng
                  </Button>
                  <div className="space-y-1">
                    <Label className="text-xs">Lý do</Label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="VD: Bổ sung NV mới nhận thêm mã cây, sửa lại số lượng ước tính..."
                      rows={2}
                      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                  <Button type="button" size="sm" disabled={editSubmitting} onClick={submitEditProposal} className="bg-primary hover:bg-primary-hover">
                    {editSubmitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                    Gửi đề xuất
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {myProposals.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="font-bold text-primary-strong">Đề xuất chỉnh sửa đã gửi</p>
            {myProposals.map((p) => (
              <div key={p.id} className="border border-divider rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-text-secondary">
                    Gửi lúc {format(new Date(p.createdAt), "dd/MM/yyyy HH:mm")} · Lý do: <span className="text-foreground">{p.reason}</span>
                  </p>
                  <ProposalStatusBadge status={p.status} />
                </div>
                {p.status === "REJECTED" && p.rejectionReason && (
                  <p className="text-sm text-destructive">Lý do từ chối: {p.rejectionReason}</p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {p.items.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1 pr-3">{item.plantType.code} — {item.plantType.name}</td>
                          <td className="py-1 pr-3 text-text-secondary">{item.assignedStaff.code} — {item.assignedStaff.name}</td>
                          <td className="py-1 text-right tabular-nums">{item.quantity.toLocaleString("vi-VN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
