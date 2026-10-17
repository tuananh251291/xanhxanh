"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Send, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS } from "@/lib/contamination-proposal-constants";
import MultiPhotoSlotGroup from "@/components/shared/multi-photo-slot-group";
import { POT_SPEC_LABELS } from "@/types";

const POT_OPTIONS = Object.entries(POT_SPEC_LABELS).map(([value, label]) => ({ value, label }));

type Room = { id: string; name: string; type: string };
type Garden = { id: string; code: string; name: string };
type Lot = { id: string; plantTypeId: string; stageCode: string; quantity: number; plantType: { code: string; name: string } };
type RowValue = { huy: string; trong: string; huyPhotos: string[]; trongPhotos: string[]; potStageCode: string };

export default function DeXuatExecuteForm({
  taskId, taskCode, taskTitle, deadlineLabel, rooms, gardens, initialRoomId, plantCategoryCodes, isMarketPartner, roomLocked = false,
}: {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  deadlineLabel: string | null;
  rooms: Room[];
  gardens: Garden[];
  initialRoomId: string | null;
  // Việc đã gắn sẵn 1 phòng (Đối tác vận hành: 3 việc/tuần, mỗi việc 1 phòng) — không hiện ô chọn phòng.
  roomLocked?: boolean;
  // Rỗng = không giới hạn (việc "kho thị trường", đã giới hạn sẵn bằng roomId/initialRoomId thay vào đó).
  plantCategoryCodes: string[];
  // Chỉ Đối tác vận hành mới bắt buộc/hiện ô đính ảnh bằng chứng — xem POST /api/contamination-proposals
  // nhánh isMarketPartner. Kho thành phẩm dùng chung form này nhưng không bị ràng buộc ảnh.
  isMarketPartner: boolean;
}) {
  const router = useRouter();
  // Kho thành phẩm: cột thứ 2 là "Chuyển về Phòng chờ xử lý" và phiếu gửi Quản lý kho thành phẩm (POST
  // /api/finished-goods-checks); Đối tác vận hành giữ nguyên luồng/nhãn cũ (đề xuất Trồng/Hủy gửi duyệt).
  const trongLabel = isMarketPartner ? "Đề xuất trồng" : "Chuyển về Phòng chờ xử lý";
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [allLots, setAllLots] = useState<Lot[]>([]);
  // PlantType.code = 2 ký tự mã Loại cây + 3 ký tự riêng (VD "MT001") — xem prisma/schema.prisma.
  const lots = plantCategoryCodes.length === 0
    ? allLots
    : allLots.filter((l) => plantCategoryCodes.includes(l.plantType.code.slice(0, 2)));
  const [loadingLots, setLoadingLots] = useState(false);
  const [values, setValues] = useState<Record<string, RowValue>>({});
  const [productionGardenId, setProductionGardenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // key = `${lotId}:huy|trong` — ô nào đang tải ảnh lên.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  // Đối tác vận hành đề xuất Trồng từ Phòng sản phẩm đạt/không đạt — cây sẽ vào Phòng cây trồng khi QL thị
  // trường duyệt, nên phải chọn quy cách chậu (S/M/L/C) cho từng dòng. Trồng từ chính Phòng cây trồng thì không.
  // Đối tác: phần Trồng luôn chọn quy cách chậu — kể cả ở Phòng cây trồng (trồng lại sang chậu khác, VD S → M).
  const needsPotSpec = isMarketPartner;
  const isPlantRoom = rooms.find((r) => r.id === roomId)?.type === "PHONG_CAY_TRONG";

  const loadLots = useCallback(async (id: string) => {
    setLoadingLots(true);
    setValues({});
    try {
      const res = await fetch(`/api/lots?roomId=${id}&status=ACTIVE`);
      const data = await res.json();
      setAllLots(Array.isArray(data) ? data : []);
    } finally {
      setLoadingLots(false);
    }
  }, []);

  useEffect(() => { if (roomId) loadLots(roomId); }, [roomId, loadLots]);

  const getValue = (lotId: string): RowValue => values[lotId] ?? { huy: "", trong: "", huyPhotos: [], trongPhotos: [], potStageCode: "" };
  const setValue = (lotId: string, patch: Partial<RowValue>) =>
    setValues((prev) => ({ ...prev, [lotId]: { ...getValue(lotId), ...patch } }));

  const addPhoto = async (lotId: string, kind: "huy" | "trong", file: File) => {
    const key = `${lotId}:${kind}`;
    setUploadingKey(key);
    try {
      const compressed = await compressImageToDataUrl(file, { ...CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS, stampTimestamp: true });
      const res = await fetch("/api/contamination-proposals/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: compressed }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Tải ảnh lên thất bại"); return; }
      const field = kind === "huy" ? "huyPhotos" : "trongPhotos";
      setValue(lotId, { [field]: [...getValue(lotId)[field], json.url] } as Partial<RowValue>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không nén được ảnh — thử lại");
    } finally {
      setUploadingKey(null);
    }
  };

  const removePhoto = async (lotId: string, kind: "huy" | "trong", url: string) => {
    const field = kind === "huy" ? "huyPhotos" : "trongPhotos";
    setValue(lotId, { [field]: getValue(lotId)[field].filter((u) => u !== url) } as Partial<RowValue>);
    await fetch("/api/contamination-proposals/photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {});
  };

  const collectRows = () =>
    lots
      .map((l) => {
        const v = getValue(l.id);
        return { lot: l, huy: parseInt(v.huy, 10) || 0, trong: parseInt(v.trong, 10) || 0, huyPhotos: v.huyPhotos, trongPhotos: v.trongPhotos, potStageCode: v.potStageCode };
      })
      .filter((r) => r.huy > 0 || r.trong > 0);

  // Bấm "Tạo phiếu đề xuất" chỉ kiểm tra hợp lệ rồi mở hộp thoại hỏi lại — NV hay nhầm nhập số túi thay
  // vì số cây, phải bấm xác nhận lần nữa (send) mới thật sự gửi.
  const submit = () => {
    const rows = collectRows();
    // Không nhập dòng nào vẫn gửi được: Kho thành phẩm = phiếu kiểm tra rỗng; Đối tác vận hành = "Đã kiểm tra –
    // không có đề xuất" (đóng việc tuần, xem action=no_proposal ở PATCH /api/daily-tasks/[id]).
    for (const r of rows) {
      if (r.huy > r.lot.quantity || r.trong > r.lot.quantity) { toast.error(`${r.lot.plantType.code}: số lượng vượt quá tồn kho`); return; }
      // Hủy + trồng/chuyển phòng đều trừ khỏi CÙNG lô này nên tổng không được vượt tồn.
      if (r.huy + r.trong > r.lot.quantity) { toast.error(`${r.lot.plantType.code}: tổng hủy + ${isMarketPartner ? "trồng" : "chuyển"} vượt quá tồn kho`); return; }
      if (needsPotSpec && r.trong > 0 && !r.potStageCode) { toast.error(`${r.lot.plantType.code}: chọn quy cách chậu cho phần đề xuất trồng`); return; }
      // Trồng lại trong Phòng cây trồng = đổi sang chậu khác (trừ quy cách cũ, cộng quy cách mới lúc duyệt) —
      // chọn trùng quy cách hiện tại thì không có gì thay đổi, chặn luôn.
      if (needsPotSpec && isPlantRoom && r.trong > 0 && r.potStageCode === r.lot.stageCode) {
        toast.error(`${r.lot.plantType.code} (${r.lot.stageCode}): Trồng lại trong Phòng cây trồng phải chọn quy cách chậu KHÁC quy cách hiện tại`); return;
      }
      // Không bắt buộc chọn Vườn sản xuất khi không có vườn nào để chọn (Đối tác vận hành ở Kho thị
      // trường — xem page.tsx truyền gardens=[] cho trường hợp này).
      if (r.trong > 0 && !productionGardenId && gardens.length > 0) { toast.error(`Chưa chọn Vườn sản xuất cho dòng ${trongLabel}`); return; }
      if (isMarketPartner) {
        if (r.huy > 0 && r.huyPhotos.length === 0) { toast.error(`${r.lot.plantType.code}: cần đính kèm ảnh cho phần đề xuất huỷ`); return; }
        if (r.trong > 0 && r.trongPhotos.length === 0) { toast.error(`${r.lot.plantType.code}: cần đính kèm ảnh cho phần đề xuất trồng`); return; }
      }
    }
    setConfirmOpen(true);
  };

  const sendCheck = async () => {
    const rows = collectRows();
    setSubmitting(true);
    try {
      const res = await fetch("/api/finished-goods-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyTaskId: taskId,
          roomId,
          lines: rows.map((r) => ({ plantTypeId: r.lot.plantTypeId, stageCode: r.lot.stageCode, destroyQuantity: r.huy, toProcessingQuantity: r.trong })),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Gửi phiếu thất bại"); return; }
      toast.success("Đã gửi phiếu kiểm tra cho Quản lý kho thành phẩm");
      router.push("/task-assignment");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  const sendNoProposal = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/daily-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "no_proposal" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã đóng việc — kiểm tra xong, không có đề xuất");
      router.push("/task-assignment");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  const send = async () => {
    if (!isMarketPartner) return sendCheck();
    if (collectRows().length === 0) return sendNoProposal();
    const rows = collectRows();
    setSubmitting(true);
    let batchCode: string | undefined;
    let successCount = 0;
    try {
      for (const r of rows) {
        const calls: { type: "HUY" | "TRONG"; quantity: number; photoUrls: string[]; plantStageCode?: string }[] = [];
        if (r.huy > 0) calls.push({ type: "HUY", quantity: r.huy, photoUrls: r.huyPhotos });
        if (r.trong > 0) calls.push({ type: "TRONG", quantity: r.trong, photoUrls: r.trongPhotos, plantStageCode: needsPotSpec ? r.potStageCode : undefined });
        for (const c of calls) {
          const res = await fetch("/api/contamination-proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: c.type,
              roomId,
              plantTypeId: r.lot.plantTypeId,
              stageCode: r.lot.stageCode,
              quantity: c.quantity,
              batchCode,
              dailyTaskId: taskId,
              photoUrls: c.photoUrls,
              plantStageCode: c.plantStageCode,
              // productionGardenId (state) có thể là null (chưa chọn/không có vườn nào, xem gardens.length
              // === 0) — gửi undefined thay vì null vì z.string().optional() không nhận null.
              productionGardenId: c.type === "TRONG" && productionGardenId ? productionGardenId : undefined,
            }),
          });
          if (!res.ok) { toast.error((await res.json()).message ?? "Có dòng gửi thất bại"); continue; }
          const created = await res.json();
          if (!batchCode) batchCode = created.batchCode ?? created.code;
          successCount += 1;
        }
      }
      if (successCount > 0) {
        toast.success(`Đã gửi ${successCount} đề xuất cho QL thị trường duyệt`);
        // Đối tác vận hành không vào được /task-assignment (bị đẩy về Dashboard) — về thẳng Dashboard.
        router.push("/dashboard");
      }
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/task-assignment">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{taskTitle}</h1>
          <p className="text-text-secondary text-sm">
            <span className="font-mono">{taskCode}</span>
            {deadlineLabel && <span className="text-warning-foreground font-medium"> · {deadlineLabel}</span>}
          </p>
        </div>
      </div>

      {!isMarketPartner && (
        <div className="text-sm text-warning-foreground bg-warning-light rounded-lg p-3 space-y-1">
          <p>Nhân viên kho lọc hàng nhiễm không còn khả năng sống điền số vào cột Đề xuất Hủy.</p>
          <p>Số lượng hàng không đạt tiêu chuẩn còn lại điền vào cột Chuyển về Phòng chờ xử lý.</p>
          <p>Sắp xếp luôn sản phẩm không đạt về Phòng chờ xử lý.</p>
        </div>
      )}

      {!roomLocked && (
      <Card>
        <CardHeader><CardTitle className="text-base">Chọn phòng</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <Select
            items={rooms.map((r) => ({ value: r.id, label: r.name }))}
            value={roomId || null}
            onValueChange={(v) => setRoomId(v as string)}
          >
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Chọn phòng cần kiểm tra" /></SelectTrigger>
            <SelectContent>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      )}

      {roomId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {roomLocked ? `Tồn kho ${rooms.find((r) => r.id === roomId)?.name ?? "trong phòng"}` : "Tồn kho trong phòng"} — nhập số lượng đề xuất
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isMarketPartner && (
              <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3">
                Bạn cần đính kèm ảnh sản phẩm cho phần đề xuất huỷ/trồng để QL thị trường xác nhận lại.
                {needsPotSpec && (isPlantRoom
                  ? <><br />Phần đề xuất trồng = trồng lại sang quy cách chậu khác (VD S → M) — khi được duyệt, cây ở lại Phòng cây trồng theo quy cách mới.</>
                  : <><br />Phần đề xuất trồng cần chọn quy cách chậu — khi được duyệt, cây chuyển sang Phòng cây trồng theo quy cách này.</>)}
                <br />
                Lưu ý hình ảnh cần chụp trên nền trắng, sắp xếp gọn gàng để hiển thị rõ số lượng, các lỗi
                của cây, tem tên cây quay ra mặt trước.
              </p>
            )}
            {loadingLots ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : lots.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                {allLots.length > 0 ? "Phòng này không có lô nào thuộc Loại cây của nhiệm vụ này" : "Phòng này không có lô nào đang tồn"}
              </p>
            ) : (
              <>
                <div className="border border-divider rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                        <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Tồn kho</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-28">Đề xuất hủy</th>
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-28">{trongLabel}</th>
                        {isMarketPartner && (
                          <>
                            <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ảnh huỷ</th>
                            <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ảnh trồng</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((l) => (
                        <tr key={l.id} className="border-t border-divider even:bg-primary-light/30 align-top">
                          <td className="px-3 py-2 text-foreground">{l.plantType.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-text-secondary">{l.plantType.code}</td>
                          <td className="px-3 py-2 text-text-secondary">{l.stageCode}</td>
                          <td className="px-3 py-2 text-right text-text-secondary">{l.quantity.toLocaleString("vi-VN")}</td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number" min={0} max={l.quantity} className="h-9 text-right"
                              value={getValue(l.id).huy}
                              onChange={(e) => setValue(l.id, { huy: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number" min={0} max={l.quantity} className="h-9 text-right"
                              value={getValue(l.id).trong}
                              onChange={(e) => setValue(l.id, { trong: e.target.value })}
                            />
                            {needsPotSpec && (parseInt(getValue(l.id).trong, 10) || 0) > 0 && (
                              <Select
                                items={isPlantRoom ? POT_OPTIONS.filter((o) => o.value !== l.stageCode) : POT_OPTIONS}
                                value={getValue(l.id).potStageCode || null}
                                onValueChange={(v) => setValue(l.id, { potStageCode: (v as string) ?? "" })}
                              >
                                <SelectTrigger className="h-9 w-full mt-1.5"><SelectValue placeholder="Quy cách chậu" /></SelectTrigger>
                                <SelectContent>
                                  {/* Phòng cây trồng: ẩn quy cách hiện tại của lô — phải trồng lại sang chậu khác. */}
                                  {(isPlantRoom ? POT_OPTIONS.filter((o) => o.value !== l.stageCode) : POT_OPTIONS).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          {isMarketPartner && (
                            <>
                              <td className="px-3 py-2">
                                <MultiPhotoSlotGroup
                                  urls={getValue(l.id).huyPhotos}
                                  editable
                                  uploading={uploadingKey === `${l.id}:huy`}
                                  onAdd={(f) => addPhoto(l.id, "huy", f)}
                                  onRemove={(u) => removePhoto(l.id, "huy", u)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <MultiPhotoSlotGroup
                                  urls={getValue(l.id).trongPhotos}
                                  editable
                                  uploading={uploadingKey === `${l.id}:trong`}
                                  onAdd={(f) => addPhoto(l.id, "trong", f)}
                                  onRemove={(u) => removePhoto(l.id, "trong", u)}
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {gardens.length > 0 && (
                  <div className="space-y-1 max-w-sm">
                    <Label>Vườn sản xuất <span className="text-text-muted font-normal">(áp dụng cho mọi dòng {trongLabel} đã nhập)</span></Label>
                    <Select
                      items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
                      value={productionGardenId}
                      onValueChange={(v) => setProductionGardenId(v as string)}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Chọn vườn" /></SelectTrigger>
                      <SelectContent>
                        {gardens.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button className="w-full bg-primary hover:bg-primary-hover" onClick={submit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {isMarketPartner ? "Tạo phiếu đề xuất" : "Gửi phiếu kiểm tra cho Quản lý"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!submitting) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Kiểm tra lại số liệu</DialogTitle></DialogHeader>
          <div className="flex items-start gap-2 text-sm font-medium text-warning-foreground bg-warning-light rounded-lg p-3">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            {collectRows().length === 0
              ? isMarketPartner
                ? "Bạn chưa nhập dòng nào — xác nhận đã kiểm tra phòng này, tuần này không có đề xuất Trồng/Hủy nào?"
                : "Bạn chưa nhập dòng nào — xác nhận kiểm tra xong, không có cây nào hỏng/hủy?"
              : "Hãy kiểm tra số liệu một lần nữa, chắc chắn rằng đây là số cây, không phải số túi."}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Kiểm tra lại</Button>
            <Button className="bg-primary hover:bg-primary-hover" onClick={send} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {collectRows().length === 0
                ? isMarketPartner ? "Đã kiểm tra – không có đề xuất" : "Xác nhận, không có cây hỏng"
                : isMarketPartner ? "Đúng là số cây, gửi đề xuất" : "Đúng là số cây, gửi phiếu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
