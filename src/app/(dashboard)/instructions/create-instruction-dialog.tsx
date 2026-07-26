"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Calculator, QrCode } from "lucide-react";
import { toast } from "sonner";
import { MOTHER_SPEC_LABELS, FINISHED_SPEC_LABELS, FINISHED_SPEC_BAG_SIZE } from "@/types";
import { startOfWeek, addWeeks, addDays, format, getISOWeek } from "date-fns";
import { vi } from "date-fns/locale";

// Mặc định chỉ định cấy áp dụng cho tuần KẾ TIẾP (không phải tuần hiện tại) — KY_THUAT lên kế hoạch trước.
function nextWeekStart(): string {
  return format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

// Tuần sớm nhất được phép chọn — tuần hiện tại (chưa trôi qua hết), không cho lùi về tuần trước. KY_THUAT
// vẫn tự do đổi sang tuần bất kỳ từ tuần này trở đi, chỉ mặc định đề xuất tuần kế tiếp ở trên.
function currentWeekStart(): Date {
  return startOfWeek(new Date(), { weekStartsOn: 1 });
}

// Tỉ lệ nhân MM/ra rễ dùng input type="text" (không phải "number") để chấp nhận CẢ dấu phẩy lẫn dấu
// chấm làm dấu thập phân — "number" chỉ hiểu dấu chấm theo chuẩn HTML, trong khi NV quen gõ kiểu Việt
// (dấu phẩy). Quy đổi dấu phẩy thành dấu chấm trước khi parse, không đổi ngược lại (giữ nguyên ký tự
// NV vừa gõ để không giật con trỏ khi đang nhập dở).
function parseRatio(value: string): number {
  return Number(value.replace(",", ".")) || 0;
}

type MediumType = { id: string; code: string; name: string };
type MotherLot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  plantTypeId: string;
  plantType: { code: string; name: string };
  shelf: {
    id: string;
    code: string;
    warehouseId: string;
    rotationGroupId: string | null;
    rotationGroup: { id: string; name: string } | null;
  } | null;
};
// Tỉ lệ nhân MM/ra rễ + môi trường dùng CHUNG cho mọi dòng đang hiển thị (cùng 1 Nhóm tuần mẫu mẹ hoặc
// 1 kệ đơn lẻ) — không còn nhập riêng từng kệ, vì các kệ cùng Nhóm coi như cùng 1 đợt cấy chuyển.
type Row = {
  shelfId: string;
  shelfCode: string;
  lotId: string;
  lotCode: string;
  stageCode: string;
  plantTypeCode: string;
  plantTypeName: string;
  available: number;
  quantityUsed: string;
};
// Thông tin Nhóm tuần mẫu mẹ đang gộp (nếu kệ được chọn có thuộc 1 Nhóm) — chỉ để hiển thị, không gửi
// lên server (server tự suy lại từ shelfId của từng dòng).
type GroupInfo = { rotationGroupName: string | null; shelfCodes: string[] };

export default function CreateInstructionDialog({
  initialShelfId,
  triggerContent,
  triggerClassName,
}: {
  // Mở dialog và tự chọn sẵn đúng kệ này — dùng cho lối tắt "Tạo chỉ định" từ banner Nhóm tuần mẫu mẹ
  // đến hạn (xem instructions/page.tsx), KY_THUAT không cần tự tìm lại kệ trong dropdown.
  initialShelfId?: string;
  // Nội dung nút mở dialog tuỳ biến — mặc định là "+ Tạo chỉ định cấy" ở đầu trang.
  triggerContent?: ReactNode;
  triggerClassName?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [motherLots, setMotherLots] = useState<MotherLot[]>([]);
  const [shelfId, setShelfId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  // Tỉ lệ + môi trường chung cho mọi dòng đang hiển thị (xem comment kiểu Row) — reset mỗi khi đổi kệ
  // nguồn/nhóm để không giữ nhầm số liệu của kệ trước.
  const [sharedMotherSampleRatio, setSharedMotherSampleRatio] = useState("");
  const [sharedRootingRatio, setSharedRootingRatio] = useState("");
  const [sharedMotherMediumTypeId, setSharedMotherMediumTypeId] = useState("");
  const [sharedFinishedMediumTypeId, setSharedFinishedMediumTypeId] = useState("");
  const [weekStart, setWeekStart] = useState(nextWeekStart);
  const [notes, setNotes] = useState("");
  // Giá trị KY_THUAT tự gõ tay (chỉ có ý nghĩa sau khi plannedTouched = true) — giá trị HIỂN THỊ thực
  // tế (plannedT01/plannedT05 bên dưới) tính trực tiếp lúc render, không đồng bộ qua effect.
  const [manualT01, setManualT01] = useState("0");
  const [manualT05, setManualT05] = useState("0");
  const [plannedTouched, setPlannedTouched] = useState(false);
  const router = useRouter();

  const shelfGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        shelfId: string;
        shelfCode: string;
        plantTypeId: string;
        plantTypeName: string;
        warehouseId: string;
        rotationGroupId: string | null;
        rotationGroupName: string | null;
        lots: MotherLot[];
      }
    >();
    for (const lot of motherLots) {
      if (!lot.shelf) continue;
      const existing = map.get(lot.shelf.id);
      if (existing) existing.lots.push(lot);
      else
        map.set(lot.shelf.id, {
          shelfId: lot.shelf.id,
          shelfCode: lot.shelf.code,
          plantTypeId: lot.plantTypeId,
          plantTypeName: lot.plantType.name,
          warehouseId: lot.shelf.warehouseId,
          rotationGroupId: lot.shelf.rotationGroupId,
          rotationGroupName: lot.shelf.rotationGroup?.name ?? null,
          lots: [lot],
        });
    }
    return Array.from(map.values());
  }, [motherLots]);
  const selectedShelf = shelfGroups.find((s) => s.shelfId === shelfId);

  const buildRows = (lots: MotherLot[]): Row[] =>
    [...lots]
      .sort((a, b) => (a.shelf?.code ?? "").localeCompare(b.shelf?.code ?? "") || a.stageCode.localeCompare(b.stageCode))
      .map((lot) => ({
        shelfId: lot.shelf?.id ?? "",
        shelfCode: lot.shelf?.code ?? "",
        lotId: lot.id,
        lotCode: lot.code,
        stageCode: lot.stageCode,
        plantTypeCode: lot.plantType.code,
        plantTypeName: lot.plantType.name,
        available: lot.quantity,
        quantityUsed: String(lot.quantity),
      }));

  // Gộp chỉ định theo cả Nhóm tuần mẫu mẹ (rotationGroupId) — kệ được chọn thuộc Nhóm nào thì lấy TẤT
  // CẢ lô mẫu mẹ (đúng loại cây, đúng kho sản xuất) trên mọi kệ cùng Nhóm đó luôn, không chỉ riêng kệ
  // vừa chọn, vì các kệ cùng Nhóm coi như 1 đợt cấy chuyển chung — KY_THUAT chỉ cần thao tác trên 1 kệ
  // đại diện (sau này là quét QR) để ra chỉ định cho cả Nhóm. Kệ chưa gán Nhóm nào thì giữ hành vi cũ
  // (chỉ lô trên đúng kệ đó).
  // Reset tỉ lệ/môi trường chung + phân bổ T01/T05 mỗi khi đổi kệ nguồn/nhóm — tránh giữ nhầm số liệu
  // của lần chọn kệ trước.
  const resetSharedInputs = () => {
    setSharedMotherSampleRatio("");
    setSharedRootingRatio("");
    setSharedMotherMediumTypeId("");
    setSharedFinishedMediumTypeId("");
    setPlannedTouched(false);
  };

  const loadRowsForShelf = async (
    anchor: { shelfId: string; plantTypeId: string; warehouseId: string; rotationGroupId: string | null; rotationGroupName: string | null },
    fallbackLots: MotherLot[],
    availableForInstruction: boolean
  ) => {
    if (!anchor.rotationGroupId) {
      setRows(buildRows(fallbackLots));
      setGroupInfo(null);
      resetSharedInputs();
      return;
    }
    setGroupLoading(true);
    try {
      const params = new URLSearchParams({ stage: "MAU_ME", status: "ACTIVE", rotationGroupId: anchor.rotationGroupId });
      if (availableForInstruction) params.set("availableForInstruction", "true");
      const groupLots: MotherLot[] = await fetch(`/api/lots?${params}`).then((r) => r.json());
      // Nhóm tuần chỉ là cơ chế xoay vòng vật lý (SUPER_ADMIN cấu hình ở /settings/shelf-groups), không
      // ràng buộc phải cùng 1 mã cây hay cùng 1 kho — lọc lại đúng mã cây VÀ đúng kho sản xuất của kệ
      // vừa chọn để giữ đúng quy tắc 1 chỉ định = 1 mã cây, không gộp nhầm kệ từ 2 kho vật lý khác nhau
      // vào chung 1 chỉ định (Nhóm tuần có thể lỡ gán kệ từ nhiều kho khác nhau).
      const matching = groupLots.filter((l) => l.plantTypeId === anchor.plantTypeId && l.shelf?.warehouseId === anchor.warehouseId);
      const finalLots = matching.length > 0 ? matching : fallbackLots;
      setRows(buildRows(finalLots));
      const shelfCodes = Array.from(new Set(finalLots.map((l) => l.shelf?.code).filter((c): c is string => !!c))).sort();
      setGroupInfo(shelfCodes.length > 1 ? { rotationGroupName: anchor.rotationGroupName, shelfCodes } : null);
    } finally {
      setGroupLoading(false);
      resetSharedInputs();
    }
  };

  useEffect(() => {
    if (!open) return;
    // Lối tắt theo 1 kệ cụ thể (initialShelfId, từ danh sách kệ đến hạn cấy chuyển) lọc thẳng theo
    // shelfId thay vì danh sách chung — danh sách chung giới hạn 200 lô mới nhất (xem /api/lots), lô
    // của 1 kệ đã đến hạn cấy chuyển (nhập kho từ lâu) rất dễ rớt khỏi top 200 đó. Đồng thời KHÔNG lọc
    // availableForInstruction ở đây: mẫu mẹ đến hạn cấy chuyển gần như LUÔN đang là nguồn của chỉ định
    // tuần trước (còn ACTIVE, vì mẫu mẹ dùng lặp lại qua nhiều tuần cấy chuyển, không bị "dùng hết" như
    // mẫu mẹ 1 lần) — nếu vẫn lọc thì kệ đến hạn nào cũng rớt sạch, dialog không bao giờ tự chọn được kệ.
    const lotsUrl = initialShelfId
      ? `/api/lots?stage=MAU_ME&status=ACTIVE&shelfId=${initialShelfId}`
      : "/api/lots?roomType=PHONG_MAU_ME&stage=MAU_ME&status=ACTIVE&availableForInstruction=true";
    Promise.all([
      fetch("/api/medium-types").then((r) => r.json()),
      fetch(lotsUrl).then((r) => r.json()),
    ]).then(([mediums, lots]: [MediumType[], MotherLot[]]) => {
      setMediumTypes(mediums);
      setMotherLots(lots);
      if (initialShelfId) {
        const rowsForShelf = lots.filter((l) => l.shelf?.id === initialShelfId);
        if (rowsForShelf.length > 0) {
          setShelfId(initialShelfId);
          const anchorLot = rowsForShelf[0];
          loadRowsForShelf(
            {
              shelfId: initialShelfId,
              plantTypeId: anchorLot.plantTypeId,
              warehouseId: anchorLot.shelf?.warehouseId ?? "",
              rotationGroupId: anchorLot.shelf?.rotationGroupId ?? null,
              rotationGroupName: anchorLot.shelf?.rotationGroup?.name ?? null,
            },
            rowsForShelf,
            false
          );
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Chọn giàn kệ → hiện tất cả các dòng quy cách (M05) đang có trên kệ đó (VÀ trên mọi kệ khác cùng
  // Nhóm tuần mẫu mẹ nếu có, xem loadRowsForShelf), mặc định lấy toàn bộ số lượng còn lại. Tỉ lệ
  // nhân/ra rễ + môi trường để trống — KY_THUAT tự nhập theo tình trạng thực tế kiểm tra lô đó, không
  // có sẵn gợi ý theo loại cây.
  const onShelfChange = (v: string) => {
    setShelfId(v);
    const group = shelfGroups.find((s) => s.shelfId === v);
    if (!group) { setRows([]); setGroupInfo(null); return; }
    loadRowsForShelf(
      {
        shelfId: group.shelfId,
        plantTypeId: group.plantTypeId,
        warehouseId: group.warehouseId,
        rotationGroupId: group.rotationGroupId,
        rotationGroupName: group.rotationGroupName,
      },
      group.lots,
      true
    );
  };

  const setRowQuantity = (idx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantityUsed: value } : r)));
  };

  const motherRatioEntered = sharedMotherSampleRatio.trim() !== "";
  const rootingRatioEntered = sharedRootingRatio.trim() !== "";
  const sharedMotherRatioNum = parseRatio(sharedMotherSampleRatio);
  const sharedRootingRatioNum = parseRatio(sharedRootingRatio);
  const rowOutputs = rows.map((r) => {
    const qty = Number(r.quantityUsed) || 0;
    return {
      ...r,
      qty,
      expectedMother: Math.floor(qty * sharedMotherRatioNum),
      expectedFinished: Math.floor(qty * sharedRootingRatioNum),
    };
  });
  const totalMotherOutput = rowOutputs.reduce((s, r) => s + r.expectedMother, 0);
  const totalFinishedOutput = rowOutputs.reduce((s, r) => s + r.expectedFinished, 0);
  // Tổng mẫu mẹ HIỆN CÓ (không phải dự kiến sau tỉ lệ) trên toàn bộ các dòng đang hiển thị — cộng dồn cả
  // Nhóm tuần mẫu mẹ nếu có, không chỉ riêng kệ vừa chọn.
  const totalAvailableMother = rows.reduce((s, r) => s + r.available, 0);

  // Tự đề xuất phân bổ T01/T05 (mặc định dồn hết vào T01) cho tới khi Kỹ thuật tự sửa tay — tính trực
  // tiếp lúc render (không dùng effect để setState, tránh render lồng thừa).
  const plannedT01 = plannedTouched ? manualT01 : String(totalFinishedOutput);
  const plannedT05 = plannedTouched ? manualT05 : "0";
  const plannedSum = (Number(plannedT01) || 0) + (Number(plannedT05) || 0);

  const resetForm = () => {
    setShelfId(""); setRows([]); setGroupInfo(null); setWeekStart(nextWeekStart()); setNotes("");
    setManualT01("0"); setManualT05("0");
    resetSharedInputs();
  };

  const onSubmit = async () => {
    if (!selectedShelf) { toast.error("Chọn giàn kệ nguồn"); return; }
    // Để trống Tuần thực hiện khiến chỉ định không bao giờ tự kết thúc được (ensureInstructionsEnded
    // lọc theo weekStart, bỏ qua bản ghi null) và NV cấy mô không nhập được nhật ký ngày (POST
    // /api/daily-records chặn cứng nếu thiếu weekStart) — bắt buộc chọn ngay từ lúc tạo.
    if (!weekStart) { toast.error("Chọn Tuần thực hiện"); return; }
    // Không cho chọn tuần đã trôi qua — so theo tuần chứa ngày đã chọn (weekStartsOn: 1), không bắt
    // buộc phải bấm đúng ngày Thứ 2, để KY_THUAT bấm đại 1 ngày trong tuần muốn chọn vẫn tính đúng.
    if (startOfWeek(new Date(weekStart), { weekStartsOn: 1 }) < currentWeekStart()) {
      toast.error("Không được chọn tuần đã trôi qua");
      return;
    }
    const usedRows = rowOutputs.filter((r) => r.qty > 0);
    if (usedRows.length === 0) { toast.error("Nhập số lượng dùng cho ít nhất 1 kệ"); return; }
    for (const r of usedRows) {
      if (r.qty > r.available) { toast.error(`Kệ ${r.shelfCode}: số lượng dùng không được vượt quá ${r.available} cụm`); return; }
    }
    // Cho phép để trống 1 hoặc cả 2 tỉ lệ (KY_THUAT có thể chưa xác định lúc tạo) — vẫn chặn nếu NHẬP
    // nhưng không hợp lệ (VD gõ "0" hoặc số âm), chỉ hỏi xác nhận khi thật sự để trống.
    if (motherRatioEntered && sharedMotherRatioNum <= 0) { toast.error("Tỉ lệ nhân MM phải lớn hơn 0"); return; }
    if (rootingRatioEntered && sharedRootingRatioNum <= 0) { toast.error("Tỉ lệ ra rễ phải lớn hơn 0"); return; }
    if (!motherRatioEntered && !window.confirm("Bạn đang để trống Tỉ lệ nhân MM — chỉ định sẽ không có mẫu mẹ dự kiến. Bạn có muốn tiếp tục không?")) return;
    if (!rootingRatioEntered && !window.confirm("Bạn đang để trống Tỉ lệ ra rễ (TP) — chỉ định sẽ không có thành phẩm dự kiến. Bạn có muốn tiếp tục không?")) return;
    // Môi trường chỉ bắt buộc chọn khi ĐÃ nhập tỉ lệ tương ứng — để trống tỉ lệ nào thì không cần môi
    // trường của tỉ lệ đó (không dùng tới, xem buildInstructionMediumNeeds ở src/lib/medium-orders.ts).
    if (motherRatioEntered && !sharedMotherMediumTypeId) { toast.error("Chọn môi trường nhân MM"); return; }
    if (rootingRatioEntered && !sharedFinishedMediumTypeId) { toast.error("Chọn môi trường ra rễ (TP)"); return; }
    if (plannedSum !== totalFinishedOutput) {
      toast.error(`Tổng phân bổ T01 + T05 (${plannedSum.toLocaleString("vi-VN")} cây) phải bằng đúng thành phẩm dự kiến (${totalFinishedOutput.toLocaleString("vi-VN")} cây)`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantTypeId: selectedShelf.plantTypeId,
          weekStart: weekStart || undefined,
          notes: notes || undefined,
          shelfItems: usedRows.map((r) => ({
            shelfId: r.shelfId,
            lotId: r.lotId,
            stageCode: r.stageCode,
            quantity: r.qty,
            motherSampleRatio: motherRatioEntered ? sharedMotherRatioNum : null,
            rootingRatio: rootingRatioEntered ? sharedRootingRatioNum : null,
            motherMediumTypeId: motherRatioEntered ? sharedMotherMediumTypeId : null,
            finishedMediumTypeId: rootingRatioEntered ? sharedFinishedMediumTypeId : null,
          })),
          plannedT01Quantity: Number(plannedT01) || 0,
          plannedT05Quantity: Number(plannedT05) || 0,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Tạo chỉ định cấy thành công — chờ Kho mô phân công nhân viên cấy");
      setOpen(false); resetForm(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={triggerContent ? "sm" : "default"} className={triggerClassName ?? "bg-primary hover:bg-primary-hover"} />}>
        {triggerContent ?? (
          <>
            <Plus className="w-4 h-4 mr-2" /> Tạo chỉ định cấy
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[84rem] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tạo chỉ định cấy mới</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">

          <div className="space-y-1">
            <Label className="flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5 text-text-muted" /> Giàn kệ nguồn <span className="text-destructive">*</span>
            </Label>
            <Select onValueChange={(v) => onShelfChange(v as string)} value={shelfId}>
              <SelectTrigger>
                <SelectValue>
                  {(v: string | null) => {
                    const g = shelfGroups.find((x) => x.shelfId === v);
                    return g ? `Kệ ${g.shelfCode} · ${g.plantTypeName}` : "Chọn kệ (mỗi kệ 1 loại cây)";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {shelfGroups.map((g) => (
                  <SelectItem key={g.shelfId} value={g.shelfId}>
                    Kệ {g.shelfCode} · {g.plantTypeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">Sau này sẽ quét QR code kệ để tự chọn đúng kệ này</p>
          </div>

          {groupLoading && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang gộp số liệu các kệ cùng Nhóm tuần mẫu mẹ…
            </div>
          )}

          {!groupLoading && groupInfo && (
            <div className="bg-primary-light rounded-lg p-3 text-xs text-primary-strong space-y-1">
              <p className="font-medium">
                Nhóm tuần mẫu mẹ &quot;{groupInfo.rotationGroupName ?? "—"}&quot; — đã gộp {groupInfo.shelfCodes.length} kệ, không cần
                tạo riêng từng kệ:
              </p>
              <p className="text-primary-strong/90">{groupInfo.shelfCodes.join(", ")}</p>
              <p>Tổng mẫu mẹ hiện có trên các kệ này: <strong>{totalAvailableMother.toLocaleString("vi-VN")} cụm</strong></p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{MOTHER_SPEC_LABELS[rows[0].stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? rows[0].stageCode}</Badge>
                <span className="text-xs text-text-secondary">
                  {rows.length === 1 ? "1 kệ" : `${rows.length} kệ — dùng chung tỉ lệ + môi trường bên dưới`}
                </span>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Kệ</th>
                      <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Mã cây</th>
                      <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Tên cây</th>
                      <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Quy cách</th>
                      <th className="text-right px-2 py-1.5 text-sm text-primary-strong font-bold">Còn lại (cụm)</th>
                      <th className="text-left px-2 py-1.5 text-sm text-primary-strong font-bold">Số lượng dùng (cụm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowOutputs.map((r, idx) => (
                      <tr key={r.lotId} className="border-t">
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.shelfCode}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-mono text-text-secondary">{r.plantTypeCode}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-text-secondary">{r.plantTypeName}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-text-secondary">
                          {MOTHER_SPEC_LABELS[r.stageCode as keyof typeof MOTHER_SPEC_LABELS] ?? r.stageCode}
                        </td>
                        <td className="px-2 py-1.5 text-right">{r.available.toLocaleString("vi-VN")}</td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number" min={0} max={r.available}
                            className="h-8 w-28"
                            value={r.quantityUsed}
                            onChange={(e) => setRowQuantity(idx, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-text-secondary">
                  Tỉ lệ + môi trường dùng chung cho {rows.length === 1 ? "kệ này" : "tất cả các kệ trên"}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tỉ lệ nhân MM</Label>
                    <Input
                      type="text" inputMode="decimal" placeholder="VD: 1,5 hoặc 1.5"
                      value={sharedMotherSampleRatio}
                      onChange={(e) => setSharedMotherSampleRatio(e.target.value)}
                    />
                    <p className="text-[11px] text-text-muted">Số cụm MM ra / số cụm MM dùng — gõ dấu phẩy hoặc dấu chấm đều được, có thể để trống nếu chưa xác định</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tỉ lệ ra TP</Label>
                    <Input
                      type="text" inputMode="decimal" placeholder="VD: 1,5 hoặc 1.5"
                      value={sharedRootingRatio}
                      onChange={(e) => setSharedRootingRatio(e.target.value)}
                    />
                    <p className="text-[11px] text-text-muted">Số cây TP ra / số cụm MM dùng — gõ dấu phẩy hoặc dấu chấm đều được, có thể để trống nếu chưa xác định</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Môi trường nhân MM{!motherRatioEntered && " (không bắt buộc — chưa nhập tỉ lệ)"}</Label>
                    <Select
                      items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                      value={sharedMotherMediumTypeId}
                      onValueChange={(v) => setSharedMotherMediumTypeId(v as string)}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                      <SelectContent>
                        {mediumTypes.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Môi trường ra rễ (TP){!rootingRatioEntered && " (không bắt buộc — chưa nhập tỉ lệ)"}</Label>
                    <Select
                      items={mediumTypes.map((m) => ({ value: m.id, label: m.code }))}
                      value={sharedFinishedMediumTypeId}
                      onValueChange={(v) => setSharedFinishedMediumTypeId(v as string)}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                      <SelectContent>
                        {mediumTypes.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Tuần thực hiện</Label>
            <Input
              type="date"
              required
              min={format(currentWeekStart(), "yyyy-MM-dd")}
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
            {weekStart && (
              <p className="text-xs text-text-secondary">
                Tuần số {getISOWeek(new Date(weekStart))} — Thứ 2, {format(new Date(weekStart), "dd/MM/yyyy", { locale: vi })} – Chủ nhật,{" "}
                {format(addDays(new Date(weekStart), 6), "dd/MM/yyyy", { locale: vi })}
              </p>
            )}
          </div>

          {(totalMotherOutput > 0 || totalFinishedOutput > 0) && (
            <div className="bg-info-light rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-info-foreground flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5" /> Tổng dự kiến (cộng dồn các quy cách nguồn)
              </p>
              <div className="bg-white rounded p-2 text-sm">
                <p>
                  → Mẫu mẹ dự kiến:{" "}
                  <strong>{motherRatioEntered ? `${totalMotherOutput.toLocaleString("vi-VN")} cụm` : "— (chưa nhập tỉ lệ)"}</strong>
                </p>
                <p>
                  → Thành phẩm dự kiến:{" "}
                  <strong>{rootingRatioEntered ? `${totalFinishedOutput.toLocaleString("vi-VN")} cây` : "— (chưa nhập tỉ lệ)"}</strong>
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phân bổ quy cách thành phẩm dự kiến</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-text-secondary">{FINISHED_SPEC_LABELS.T01}</Label>
                    <Input
                      type="number" min={0}
                      value={plannedT01}
                      onChange={(e) => {
                        setPlannedTouched(true);
                        setManualT01(e.target.value);
                        setManualT05(String(Math.max(0, totalFinishedOutput - (Number(e.target.value) || 0))));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-text-secondary">{FINISHED_SPEC_LABELS.T05}</Label>
                    <Input
                      type="number" min={0}
                      value={plannedT05}
                      onChange={(e) => {
                        // Chốt luôn giá trị T01 đang hiển thị (auto hoặc đã sửa tay từ trước) vào state
                        // gõ tay TẠI THỜI ĐIỂM NÀY — vì sau khi touched=true, plannedT01 sẽ đọc thẳng từ
                        // manualT01 thay vì tự tính lại theo totalFinishedOutput.
                        setPlannedTouched(true);
                        setManualT01(plannedT01);
                        setManualT05(e.target.value);
                      }}
                    />
                    <p className="text-xs text-text-muted">
                      ≈ {Math.floor((Number(plannedT05) || 0) / FINISHED_SPEC_BAG_SIZE.T05).toLocaleString("vi-VN")} túi
                      {(Number(plannedT05) || 0) % FINISHED_SPEC_BAG_SIZE.T05 > 0 && ` (dư ${(Number(plannedT05) || 0) % FINISHED_SPEC_BAG_SIZE.T05} cây)`}
                    </p>
                  </div>
                </div>
                <p className={plannedSum === totalFinishedOutput ? "text-xs text-primary-strong" : "text-xs text-warning-foreground"}>
                  Đã phân bổ: {plannedSum.toLocaleString("vi-VN")} / {totalFinishedOutput.toLocaleString("vi-VN")} cây
                  {plannedSum !== totalFinishedOutput && " — phải khớp đúng mới tạo được chỉ định"}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú thêm..." />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button
              type="button" className="flex-1 bg-primary hover:bg-primary-hover"
              disabled={loading || plannedSum !== totalFinishedOutput}
              onClick={onSubmit}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tạo chỉ định
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
