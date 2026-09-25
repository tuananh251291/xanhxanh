"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { compressImageToDataUrl } from "@/lib/image-compress";
import { CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS } from "@/lib/contamination-proposal-constants";
import MultiPhotoSlotGroup from "@/components/shared/multi-photo-slot-group";

type Room = { id: string; name: string; type: string };
type Garden = { id: string; code: string; name: string };
type Lot = { id: string; plantTypeId: string; stageCode: string; quantity: number; plantType: { code: string; name: string } };
type RowValue = { huy: string; trong: string; huyPhotos: string[]; trongPhotos: string[] };

export default function DeXuatExecuteForm({
  taskId, taskCode, taskTitle, deadlineLabel, rooms, gardens, initialRoomId, plantCategoryCodes, isMarketPartner,
}: {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  deadlineLabel: string | null;
  rooms: Room[];
  gardens: Garden[];
  initialRoomId: string | null;
  // Rỗng = không giới hạn (việc "kho thị trường", đã giới hạn sẵn bằng roomId/initialRoomId thay vào đó).
  plantCategoryCodes: string[];
  // Chỉ Đối tác vận hành mới bắt buộc/hiện ô đính ảnh bằng chứng — xem POST /api/contamination-proposals
  // nhánh isMarketPartner. Kho thành phẩm dùng chung form này nhưng không bị ràng buộc ảnh.
  isMarketPartner: boolean;
}) {
  const router = useRouter();
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
  // key = `${lotId}:huy|trong` — ô nào đang tải ảnh lên.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

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

  const getValue = (lotId: string): RowValue => values[lotId] ?? { huy: "", trong: "", huyPhotos: [], trongPhotos: [] };
  const setValue = (lotId: string, patch: Partial<RowValue>) =>
    setValues((prev) => ({ ...prev, [lotId]: { ...getValue(lotId), ...patch } }));

  const addPhoto = async (lotId: string, kind: "huy" | "trong", file: File) => {
    const key = `${lotId}:${kind}`;
    setUploadingKey(key);
    try {
      const compressed = await compressImageToDataUrl(file, CONTAMINATION_PROPOSAL_COMPRESS_OPTIONS);
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

  const submit = async () => {
    const rows = lots
      .map((l) => {
        const v = getValue(l.id);
        return { lot: l, huy: parseInt(v.huy, 10) || 0, trong: parseInt(v.trong, 10) || 0, huyPhotos: v.huyPhotos, trongPhotos: v.trongPhotos };
      })
      .filter((r) => r.huy > 0 || r.trong > 0);
    if (rows.length === 0) { toast.error("Chưa nhập số lượng dòng nào"); return; }
    for (const r of rows) {
      if (r.huy > r.lot.quantity || r.trong > r.lot.quantity) { toast.error(`${r.lot.plantType.code}: số lượng vượt quá tồn kho`); return; }
      // Không bắt buộc chọn Vườn sản xuất khi không có vườn nào để chọn (Đối tác vận hành ở Kho thị
      // trường — xem page.tsx truyền gardens=[] cho trường hợp này).
      if (r.trong > 0 && !productionGardenId && gardens.length > 0) { toast.error("Chưa chọn Vườn sản xuất cho dòng Trồng"); return; }
      if (isMarketPartner) {
        if (r.huy > 0 && r.huyPhotos.length === 0) { toast.error(`${r.lot.plantType.code}: cần đính kèm ảnh cho phần đề xuất huỷ`); return; }
        if (r.trong > 0 && r.trongPhotos.length === 0) { toast.error(`${r.lot.plantType.code}: cần đính kèm ảnh cho phần đề xuất trồng`); return; }
      }
    }

    setSubmitting(true);
    let batchCode: string | undefined;
    let successCount = 0;
    try {
      for (const r of rows) {
        const calls: { type: "HUY" | "TRONG"; quantity: number; photoUrls: string[] }[] = [];
        if (r.huy > 0) calls.push({ type: "HUY", quantity: r.huy, photoUrls: r.huyPhotos });
        if (r.trong > 0) calls.push({ type: "TRONG", quantity: r.trong, photoUrls: r.trongPhotos });
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
        toast.success(`Đã gửi ${successCount} đề xuất cho Admin duyệt`);
        router.push("/task-assignment");
      }
    } finally {
      setSubmitting(false);
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

      {roomId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Tồn kho trong phòng — nhập số lượng đề xuất</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {isMarketPartner && (
              <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3">
                Bạn cần đính kèm ảnh sản phẩm cho phần đề xuất huỷ/trồng để quản lý kĩ thuật xác nhận lại.
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
                        <th className="text-right px-3 py-2 text-base text-primary-strong font-bold w-28">Đề xuất trồng</th>
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
                    <Label>Vườn sản xuất <span className="text-text-muted font-normal">(áp dụng cho mọi dòng Trồng đã nhập)</span></Label>
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
                  Tạo phiếu đề xuất
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
