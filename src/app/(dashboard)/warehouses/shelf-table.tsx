"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Trash2, Loader2, Pencil, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { toast } from "sonner";
import QRCodeDisplay from "@/components/shared/qr-code-display";
import { sumLotQuantity } from "@/types";
import type { RoomType } from "@prisma/client";

interface PlantType {
  id: string;
  code: string;
  name: string;
}

interface Staff {
  id: string;
  code: string;
  name: string;
}

interface MoveableRoom {
  id: string;
  code: string;
  name: string;
  type: RoomType;
}

interface Shelf {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  rowNumber: number | null;
  colNumber: number | null;
  capacity: number | null;
  plantType: PlantType | null;
  assignedStaff: Staff | null;
  sharedMotherPool: "QUA_HAN" | "DUNG_HAN" | null;
  allowedCodes: string[];
  rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
  lots: { id: string; code: string; quantity: number; stageCode: string; plantType: { code: string; name: string } }[];
}

const POOL_LABELS: Record<string, string> = { QUA_HAN: "Kho quá hạn", DUNG_HAN: "Kho đúng hạn" };

// "Cho phép xếp" — Admin gõ tay danh sách chuỗi cách nhau bằng dấu phẩy (VD "EP, HM, AT, MT041"), tự bỏ
// dấu nháy/khoảng trắng thừa nếu có gõ kèm. Lưu dạng mảng, hiển thị lại nối bằng ", ".
function parseAllowedCodes(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^['"]+|['"]+$/g, "").toUpperCase())
    .filter(Boolean);
}

// Sức chứa — Admin cấp cao cài đặt số ban đầu lúc tạo kệ (xem add-shelves-dialog.tsx), sửa lại sau tại
// đây. Đơn vị theo room type: Phòng mẫu mẹ tính theo cụm, Phòng ra rễ tính theo cây (xem đơn vị hiển
// thị kèm ở renderRow). Để trống = không giới hạn (lưu null).
function CapacityCell({
  shelfId, initialCapacity, disabled, onSave,
}: {
  shelfId: string;
  initialCapacity: number | null;
  disabled: boolean;
  onSave: (shelfId: string, capacity: number | null) => void;
}) {
  const [value, setValue] = useState(initialCapacity != null ? String(initialCapacity) : "");
  const save = () => {
    const trimmed = value.trim();
    if (trimmed === "") { onSave(shelfId, null); return; }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValue(initialCapacity != null ? String(initialCapacity) : "");
      return;
    }
    onSave(shelfId, Math.trunc(parsed));
  };
  return (
    <Input
      type="number"
      min={1}
      className="h-6 w-14 text-xs px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      placeholder="Không giới hạn"
    />
  );
}

function AllowedCodesCell({
  shelfId, initialCodes, disabled, onSave,
}: {
  shelfId: string;
  initialCodes: string[];
  disabled: boolean;
  onSave: (shelfId: string, codes: string[]) => void;
}) {
  const [value, setValue] = useState(initialCodes.join(", "));
  return (
    <Input
      className="h-8 text-xs"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(shelfId, parseAllowedCodes(value))}
      placeholder="VD: EP, HM, AT, MT041"
    />
  );
}

// 1 dòng lô trong dialog "Sửa số lượng lô cây" — tự quản lý state ô nhập + trạng thái lưu riêng, tránh
// re-render toàn dialog khi gõ 1 ô.
function LotQuantityRow({
  lot, unit, onSave,
}: {
  lot: { id: string; code: string; stageCode: string; quantity: number; plantType: { code: string; name: string } };
  unit: string;
  onSave: (lotId: string, quantity: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(lot.quantity));
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== String(lot.quantity);

  const save = async () => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      toast.error("Số lượng phải là số nguyên không âm");
      setValue(String(lot.quantity));
      return;
    }
    setSaving(true);
    try {
      await onSave(lot.id, parsed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-xs font-mono text-text-secondary whitespace-nowrap">{lot.code}</td>
      <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{lot.plantType.code}</td>
      <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{lot.stageCode}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            className="h-8 w-24 text-xs"
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          />
          <span className="text-xs text-text-muted shrink-0">{unit}</span>
          <Button
            type="button" size="icon-sm" className="shrink-0 bg-primary hover:bg-primary-hover"
            disabled={saving || !dirty}
            onClick={save}
            title="Lưu số lượng"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </td>
    </tr>
  );
}

const STAGE_CODE_OPTIONS_BY_ROOM: Record<"PHONG_MAU_ME" | "PHONG_RA_RE", { value: string; label: string }[]> = {
  PHONG_MAU_ME: [{ value: "M05", label: "M05" }],
  PHONG_RA_RE: [
    { value: "T01", label: "T01 — túi 1 cây" },
    { value: "T05", label: "T05 — túi 5 cây" },
    { value: "T10", label: "T10 — túi 10 cây" },
  ],
};

// Thêm lô MỚI vào giàn kệ ngay trong dialog "Sửa số lượng lô cây" — dùng cho kệ đang trống (0/sức chứa,
// không có lô nào để sửa) hoặc muốn thêm 1 mã cây/quy cách khác chưa có trên kệ. Gọi thẳng
// POST /api/inventory/stock-in (mode ADD) — dùng lại NGUYÊN VẸN logic kiểm tra sức chứa/loại phòng/mã
// cây được phép xếp đã có sẵn cho trang "Nhập kho thủ công" (src/app/(dashboard)/inventory/nhap-kho),
// không viết lại từ đầu.
function AddLotForm({
  shelfId, warehouseId, roomType, plantTypeOptions, unit, onAdded,
}: {
  shelfId: string;
  warehouseId: string;
  roomType: "PHONG_MAU_ME" | "PHONG_RA_RE";
  plantTypeOptions: { value: string; label: string }[];
  unit: string;
  onAdded: () => void;
}) {
  const stageOptions = STAGE_CODE_OPTIONS_BY_ROOM[roomType];
  const [plantType, setPlantType] = useState<{ value: string; label: string } | null>(null);
  const [stageCode, setStageCode] = useState(stageOptions[0].value);
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!plantType) { toast.error("Chọn mã cây"); return; }
    const qty = Number(quantity);
    if (!qty || qty <= 0) { toast.error("Số lượng phải lớn hơn 0"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: "SHELF", shelfId, mode: "ADD", warehouseId,
          items: [{ plantTypeId: plantType.value, stageCode, quantity: qty }],
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã thêm lô mới vào kệ");
      setPlantType(null);
      setQuantity("");
      onAdded();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 p-3 bg-primary-light/40 rounded-lg">
      <div className="space-y-1">
        <Label className="text-xs">Mã cây</Label>
        <Combobox
          items={plantTypeOptions}
          value={plantType}
          isItemEqualToValue={(a: { value: string; label: string }, b: { value: string; label: string }) => a.value === b.value}
          onValueChange={(v) => setPlantType(v)}
          disabled={submitting}
        >
          <ComboboxInputGroup className="w-48 h-8">
            <ComboboxInput className="text-xs" placeholder="Gõ mã hoặc tên cây…" />
            <ComboboxTrigger />
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
            <ComboboxList>
              {(item: { value: string; label: string }) => <ComboboxItem key={item.value} value={item} className="text-xs">{item.label}</ComboboxItem>}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quy cách</Label>
        <Select value={stageCode} onValueChange={(v) => setStageCode(v as string)}>
          <SelectTrigger className="w-28 h-8 text-xs" disabled={submitting}><SelectValue /></SelectTrigger>
          <SelectContent>
            {stageOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Số lượng ({unit})</Label>
        <Input
          type="number" min={1} className="h-8 w-28 text-xs"
          value={quantity} disabled={submitting}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      <Button type="button" size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
        Thêm lô
      </Button>
    </div>
  );
}

export default function ShelfTable({
  shelves,
  currentRoomId,
  currentRoomType,
  staffOptions = [],
  plantTypeOptions = [],
  rotationGroupOptions = [],
  canManageStaffAndPlant = false,
  canMoveRoom = false,
  moveableRooms = [],
  section,
}: {
  shelves: Shelf[];
  currentRoomId: string | null;
  currentRoomType: RoomType | null;
  staffOptions?: Staff[];
  plantTypeOptions?: PlantType[];
  // Danh sách Nhóm tuần (RA_RE cho Phòng ra rễ, MAU_ME cho Phòng mẫu mẹ "đã chia") để gán trực tiếp ở
  // đây — caller (rooms/[roomId]/shelf-list-view.tsx) tự chọn đúng rotationKind theo room.type.
  rotationGroupOptions?: { id: string; name: string }[];
  canManageStaffAndPlant?: boolean;
  canMoveRoom?: boolean;
  moveableRooms?: MoveableRoom[];
  // Khi truyền vào (từ trang con /da-chia hoặc /chung của Phòng mẫu mẹ — xem rooms/[roomId]/shelf-list-view.tsx),
  // component chỉ vẽ ĐÚNG 1 bảng theo nhóm đó, bỏ qua việc tự tách "đã chia"/"chung" từ danh sách `shelves`
  // (danh sách lúc này đã được server lọc sẵn đúng 1 trang của đúng 1 nhóm) — tránh đếm nhầm "(N kệ)" theo
  // 8 dòng của 1 trang thay vì tổng số thật của cả nhóm.
  section?: "DA_CHIA" | "CHUNG";
}) {
  const [qrShelf, setQrShelf] = useState<Shelf | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rotationSavingId, setRotationSavingId] = useState<string | null>(null);
  // Giá trị Nhóm tuần đang CHỌN trong dropdown (chưa bấm Lưu) theo từng kệ — tách khỏi ô Lưu (nút Lưu
  // nằm chung cột với nút Xóa ở cuối hàng) nên cần giữ ở đây thay vì state cục bộ trong 1 ô như trước.
  const [rotationValues, setRotationValues] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assignStaffTarget, setAssignStaffTarget] = useState<Shelf | null>(null);
  const [assignStaffValue, setAssignStaffValue] = useState<{ value: string; label: string } | null>(null);
  const [assignPlantTypeValue, setAssignPlantTypeValue] = useState<{ value: string; label: string } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Chỉ giữ id, tự tra lại đúng shelf mới nhất trong `shelves` (prop) mỗi lần render — tránh dialog hiện
  // số liệu cũ sau khi router.refresh() cập nhật `shelves` nhưng object đã chụp lúc mở dialog không đổi.
  const [editLotsShelfId, setEditLotsShelfId] = useState<string | null>(null);
  const router = useRouter();
  const isMauMeRoom = currentRoomType === "PHONG_MAU_ME";
  const otherRooms = moveableRooms.filter((r) => r.id !== currentRoomId);
  // moveableRooms (prop) đã bị loại sẵn phòng HIỆN TẠI (xem rooms/[roomId]/shelf-list-view.tsx) — nên
  // nếu đang đứng ở chính Phòng mẫu mẹ thì tìm "phòng khác cùng loại PHONG_MAU_ME" trong danh sách đó
  // sẽ luôn ra rỗng (không có phòng mẫu mẹ thứ 2), khiến 2 lựa chọn "Kho mẫu mẹ chung"/"Kho mẫu mẹ đã
  // chia" biến mất hoàn toàn, chỉ còn "Phòng ra rễ" (phòng thật sự khác nên không bị loại). Chuyển
  // chung/đã chia là ĐỔI CÁCH PHÂN LOẠI trong CHÍNH Phòng mẫu mẹ đang đứng (không đổi roomId) — nên khi
  // đang ở Phòng mẫu mẹ phải dùng thẳng currentRoomId, chỉ cần tra moveableRooms khi đang ở phòng khác
  // (VD Phòng ra rễ) muốn chuyển hẳn sang Phòng mẫu mẹ.
  const motherRoomId = isMauMeRoom ? currentRoomId : (moveableRooms.find((r) => r.type === "PHONG_MAU_ME")?.id ?? null);
  const raReRoom = moveableRooms.find((r) => r.type === "PHONG_RA_RE");

  // Danh sách gõ-tìm cho combobox "Nhân viên phụ trách" — gõ tên/mã sẽ tự lọc gợi ý.
  const staffComboboxOptions = useMemo(
    () => [
      { value: "NONE", label: "— Chưa gán nhân viên —" },
      ...staffOptions.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    ],
    [staffOptions]
  );

  // Danh sách gõ-tìm cho combobox "Mã cây" (Kho mẫu mẹ đã chia) — gõ mã hoặc tên sẽ tự lọc gợi ý, giống
  // hệt combobox "Nhân viên phụ trách" ở trên.
  const plantTypeComboboxOptions = useMemo(
    () => [
      { value: "NONE", label: "— Chưa gán mã cây —" },
      ...plantTypeOptions.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
    ],
    [plantTypeOptions]
  );

  const patchShelf = async (shelfId: string, body: Record<string, unknown>, successMsg: string) => {
    setSavingId(shelfId);
    try {
      const res = await fetch(`/api/shelves/${shelfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(successMsg);
      router.refresh();
    } finally { setSavingId(null); }
  };

  const editLotsShelf = shelves.find((s) => s.id === editLotsShelfId) ?? null;

  const saveLotQuantity = async (lotId: string, quantity: number) => {
    const res = await fetch(`/api/lots/${lotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
    toast.success("Đã cập nhật số lượng lô");
    router.refresh();
  };

  // Gán/gỡ Nhóm tuần ra rễ cho 1 kệ — dùng đúng API quản lý Nhóm (PATCH /api/shelf-groups/[id]/shelves,
  // action assign/unassign), KHÔNG qua PATCH /api/shelves/[id] (route đó đã chặn sửa rotationGroupId,
  // xem comment đầu file route.ts — phải đổi qua đúng cơ chế Nhóm để giữ ràng buộc nghiệp vụ, VD chỉ
  // nhận đúng loại phòng RA_RE/MAU_ME).
  const setRotationGroup = async (shelfId: string, targetGroupId: string | null, currentGroupId: string | null) => {
    if (targetGroupId === currentGroupId) return;
    setRotationSavingId(shelfId);
    try {
      if (targetGroupId) {
        const res = await fetch(`/api/shelf-groups/${targetGroupId}/shelves`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shelfIds: [shelfId], action: "assign" }),
        });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      } else if (currentGroupId) {
        const res = await fetch(`/api/shelf-groups/${currentGroupId}/shelves`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shelfIds: [shelfId], action: "unassign" }),
        });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      toast.success(`Đã cập nhật Nhóm tuần ${isMauMeRoom ? "mẫu mẹ" : "ra rễ"} cho kệ`);
      router.refresh();
    } finally { setRotationSavingId(null); }
  };

  const getRotationValue = (shelf: Shelf) => rotationValues[shelf.id] ?? (shelf.rotationGroup?.id ?? "NONE");

  // Dropdown chọn Nhóm tuần (RA_RE hoặc MAU_ME tuỳ room) — dùng chung cho cả 2 cột "Nhóm tuần ra rễ"
  // (Phòng ra rễ) và "Nhóm tuần mẫu mẹ" (Phòng mẫu mẹ đã chia). Nút Lưu tách riêng, nằm ở cột cuối cùng
  // cạnh nút Xóa (xem renderRow).
  const renderRotationSelect = (shelf: Shelf) => {
    const value = getRotationValue(shelf);
    return (
      <Select value={value} onValueChange={(v) => setRotationValues((prev) => ({ ...prev, [shelf.id]: v as string }))}>
        <SelectTrigger className="h-8 text-xs w-40" disabled={rotationSavingId === shelf.id}>
          <SelectValue>
            {() => (value === "NONE" ? "— Chưa gán —" : (rotationGroupOptions.find((o) => o.id === value)?.name ?? "— Chưa gán —"))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="NONE">— Chưa gán —</SelectItem>
          {rotationGroupOptions.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const deleteShelf = async (shelf: Shelf) => {
    const totalQty = sumLotQuantity(shelf.lots);
    const unit = isMauMeRoom ? "cụm" : "cây";
    const confirmMsg = shelf.lots.length > 0
      ? `Giàn kệ ${shelf.name} đang có ${shelf.lots.length} lô cây (tổng ${totalQty.toLocaleString("vi-VN")} ${unit}). Xóa kệ sẽ không xóa dữ liệu lô nhưng kệ sẽ biến mất khỏi danh sách đang hoạt động. Bạn có chắc chắn muốn xóa?`
      : `Xóa giàn kệ ${shelf.name}?`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(shelf.id);
    try {
      const res = await fetch(`/api/shelves/${shelf.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã xóa giàn kệ ${shelf.name}`);
      router.refresh();
    } finally { setDeletingId(null); }
  };

  const toggleSelect = (shelfId: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [shelfId]: checked }));
  };

  const toggleSelectAll = (rows: Shelf[], checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const s of rows) next[s.id] = checked;
      return next;
    });
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const deleteSelectedShelves = async () => {
    const targets = shelves.filter((s) => selected[s.id]);
    if (targets.length === 0) return;
    const totalQty = targets.reduce((sum, s) => sum + sumLotQuantity(s.lots), 0);
    const totalLots = targets.reduce((sum, s) => sum + s.lots.length, 0);
    const bulkUnit = isMauMeRoom ? "cụm" : "cây";
    const confirmMsg = totalLots > 0
      ? `Xóa ${targets.length} giàn kệ đã chọn? Trong đó có ${totalLots} lô cây (tổng ${totalQty.toLocaleString("vi-VN")} ${bulkUnit}) — xóa kệ sẽ không xóa dữ liệu lô nhưng kệ sẽ biến mất khỏi danh sách đang hoạt động.`
      : `Xóa ${targets.length} giàn kệ đã chọn?`;
    if (!window.confirm(confirmMsg)) return;

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/shelves", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targets.map((s) => s.id) }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã xóa ${targets.length} giàn kệ`);
      setSelected({});
      router.refresh();
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmAssignToDaChia = async () => {
    if (!assignStaffTarget || !assignStaffValue || assignStaffValue.value === "NONE" || !assignPlantTypeValue || !motherRoomId) return;
    await patchShelf(
      assignStaffTarget.id,
      { roomId: motherRoomId, assignedStaffId: assignStaffValue.value, plantTypeId: assignPlantTypeValue.value },
      `Đã chuyển kệ ${assignStaffTarget.name} sang Kho mẫu mẹ đã chia`
    );
    setAssignStaffTarget(null);
    setAssignStaffValue(null);
    setAssignPlantTypeValue(null);
  };

  type MoveTarget = { key: string; label: string; action: () => void };

  // SUPER_ADMIN mới được chọn đích cụ thể "Kho mẫu mẹ đã chia"/"Kho mẫu mẹ chung" — 2 đích này gắn liền
  // quyết định gán/bỏ nhân viên, vốn đã giới hạn SUPER_ADMIN ở cột "Nhân viên phụ trách" phía trên. Admin
  // thường chỉ chuyển phòng thô như cũ (không đổi nhân viên phụ trách).
  const buildMoveTargets = (shelf: Shelf, isChungSection: boolean): MoveTarget[] => {
    if (!canManageStaffAndPlant) {
      return otherRooms.map((r) => ({
        key: r.id,
        label: r.name,
        action: () => patchShelf(shelf.id, { roomId: r.id }, `Đã chuyển kệ ${shelf.name} sang ${r.name}`),
      }));
    }
    const targets: MoveTarget[] = [];
    const inDaChia = isMauMeRoom && !isChungSection;
    const inChung = isMauMeRoom && isChungSection;
    const inRaRe = !isMauMeRoom;
    if (!inChung && motherRoomId) {
      targets.push({
        key: "CHUNG",
        label: "Kho mẫu mẹ chung",
        // Bỏ gán cả nhân viên lẫn mã cây riêng — kệ "chung" dùng "Cho phép xếp" (allowedCodes) thay cho
        // plantTypeId, giữ plantTypeId cũ sẽ gây hiểu nhầm dù không hiển thị ở bảng "chung".
        action: () =>
          patchShelf(
            shelf.id,
            { roomId: motherRoomId, assignedStaffId: null, plantTypeId: null },
            `Đã chuyển kệ ${shelf.name} sang Kho mẫu mẹ chung`
          ),
      });
    }
    if (!inDaChia && motherRoomId) {
      targets.push({ key: "DA_CHIA", label: "Kho mẫu mẹ đã chia", action: () => setAssignStaffTarget(shelf) });
    }
    if (!inRaRe && raReRoom) {
      targets.push({
        key: "RA_RE",
        label: "Phòng ra rễ",
        action: () => patchShelf(shelf.id, { roomId: raReRoom.id }, `Đã chuyển kệ ${shelf.name} sang Phòng ra rễ`),
      });
    }
    return targets;
  };

  // Kệ chung (isChungSection) không gán cố định 1 mã cây nên có thể đang xếp lẫn NHIỀU mã cây cùng lúc —
  // tách theo mã cây thật sự có trên kệ (breakdown), mỗi mã cây 1 dòng riêng ở cột "Số cụm M05" thay vì
  // gộp mù mờ 1 dòng/kệ. Kệ đã chia luôn đúng 1 mã cây (theo thiết kế) nên không cần tách — trả về null để
  // renderRows giữ nguyên 1 dòng/kệ như trước.
  const plantTypeBreakdown = (shelf: Shelf) => {
    const map = new Map<string, { plantTypeCode: string; plantTypeName: string; bagsBySpec: Record<string, number> }>();
    // Bỏ qua lô đã về 0 cụm — lô còn "ACTIVE" trong DB (chưa dọn hẳn) nhưng số lượng thật đã hết thì
    // không còn được coi là "đang xếp trên kệ" nữa, mã cây phải biến mất khỏi kệ theo đúng số lượng thật.
    for (const l of shelf.lots) {
      if (l.quantity === 0) continue;
      const entry = map.get(l.plantType.code) ?? { plantTypeCode: l.plantType.code, plantTypeName: l.plantType.name, bagsBySpec: {} };
      entry.bagsBySpec[l.stageCode] = (entry.bagsBySpec[l.stageCode] ?? 0) + l.quantity;
      map.set(l.plantType.code, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode));
  };

  const renderRows = (shelf: Shelf, isChungSection: boolean) => {
    const used = sumLotQuantity(shelf.lots);
    const usage = shelf.capacity ? Math.round((used / shelf.capacity) * 100) : null;
    const bagsBySpecAll = shelf.lots.reduce<Record<string, number>>((acc, l) => {
      acc[l.stageCode] = (acc[l.stageCode] ?? 0) + l.quantity;
      return acc;
    }, {});
    const breakdown = isMauMeRoom && isChungSection ? plantTypeBreakdown(shelf) : [];
    const groups = breakdown.length > 0 ? breakdown : [null];

    return groups.map((group, idx) => renderRow(shelf, isChungSection, used, usage, bagsBySpecAll, group, idx, groups.length));
  };

  const renderRow = (
    shelf: Shelf,
    isChungSection: boolean,
    used: number,
    usage: number | null,
    bagsBySpecAll: Record<string, number>,
    group: { plantTypeCode: string; plantTypeName: string; bagsBySpec: Record<string, number> } | null,
    idx: number,
    rowCount: number
  ) => {
    const bagsBySpec = group ? group.bagsBySpec : bagsBySpecAll;
    return (
      <tr key={shelf.id + "-" + idx} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
        {idx === 0 && canManageStaffAndPlant && (
          <td className="px-3 py-2 w-8" rowSpan={rowCount}>
            <Checkbox checked={!!selected[shelf.id]} onCheckedChange={(v) => toggleSelect(shelf.id, v === true)} />
          </td>
        )}
        {idx === 0 && (
          <td className="px-3 py-2 whitespace-nowrap" rowSpan={rowCount}>
            <button
              className="flex items-center gap-1.5 text-left"
              onClick={() => setQrShelf(shelf)}
              title="Xem QR"
            >
              <span className="text-sm font-bold text-foreground">{shelf.name}</span>
              <QrCode className="w-3.5 h-3.5 text-text-muted shrink-0" />
            </button>
          </td>
        )}
        {!isMauMeRoom && (
          <td className="px-3 py-2 min-w-[160px]">
            {canManageStaffAndPlant ? renderRotationSelect(shelf) : (
              <span className="text-xs text-text-secondary">{shelf.rotationGroup?.name ?? "— Chưa gán —"}</span>
            )}
          </td>
        )}
        {isMauMeRoom && (
          <>
            {!isChungSection && (
              <>
                <td className="px-3 py-2 min-w-[160px]">
                  {canManageStaffAndPlant ? (
                    <Combobox
                      items={plantTypeComboboxOptions}
                      value={shelf.plantType ? plantTypeComboboxOptions.find((o) => o.value === shelf.plantType!.id) ?? null : null}
                      isItemEqualToValue={(a, b) => a.value === b.value}
                      disabled={savingId === shelf.id}
                      onValueChange={(v) =>
                        v && patchShelf(shelf.id, { plantTypeId: v.value === "NONE" ? null : v.value }, "Đã cập nhật mã cây cho kệ")
                      }
                    >
                      <ComboboxInputGroup className="w-full h-8">
                        <ComboboxInput className="text-xs" placeholder="Gõ mã hoặc tên cây…" />
                        <ComboboxTrigger />
                      </ComboboxInputGroup>
                      <ComboboxContent>
                        <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                        <ComboboxList>
                          {(item: { value: string; label: string }) => (
                            <ComboboxItem key={item.value} value={item} className="text-xs">
                              {item.label}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  ) : (
                    <span className="text-xs text-text-secondary">{shelf.plantType?.name ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 min-w-[160px]">
                  {canManageStaffAndPlant ? (
                    <Combobox
                      items={staffComboboxOptions}
                      // Không gán -> value null để ô trống hiện placeholder (bấm vào gõ luôn được),
                      // thay vì hiện sẵn chữ "— Chưa gán nhân viên —" khiến gõ ký tự đầu bị chèn giữa
                      // chữ cũ (xem onFocus select() trong ComboboxInput cho trường hợp gõ đè lại).
                      value={shelf.assignedStaff ? staffComboboxOptions.find((o) => o.value === shelf.assignedStaff!.id) ?? null : null}
                      isItemEqualToValue={(a, b) => a.value === b.value}
                      disabled={savingId === shelf.id}
                      onValueChange={(v) =>
                        v && patchShelf(shelf.id, { assignedStaffId: v.value === "NONE" ? null : v.value }, "Đã cập nhật nhân viên cho kệ")
                      }
                    >
                      <ComboboxInputGroup className="w-full h-8">
                        <ComboboxInput className="text-xs" placeholder="Gõ tên hoặc mã NV…" />
                        <ComboboxTrigger />
                      </ComboboxInputGroup>
                      <ComboboxContent>
                        <ComboboxEmpty>Không tìm thấy nhân viên</ComboboxEmpty>
                        <ComboboxList>
                          {(item: { value: string; label: string }) => (
                            <ComboboxItem key={item.value} value={item} className="text-xs">
                              {item.label}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  ) : (
                    <span className="text-xs text-text-secondary">{shelf.assignedStaff?.name ?? "Chưa gán"}</span>
                  )}
                </td>
                <td className="px-3 py-2 min-w-[160px]">
                  {canManageStaffAndPlant ? renderRotationSelect(shelf) : (
                    <span className="text-xs text-text-secondary">{shelf.rotationGroup?.name ?? "— Chưa gán —"}</span>
                  )}
                </td>
              </>
            )}
            {isChungSection && (
              <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{group ? group.plantTypeName : "—"}</td>
            )}
            <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
              {Object.keys(bagsBySpec).length === 0
                ? "—"
                : Object.entries(bagsBySpec)
                    .map(([spec, qty]) => `${spec}: ${qty} cụm`)
                    .join(" · ")}
            </td>
            {isChungSection && idx === 0 && (
              <>
                <td className="px-3 py-2 min-w-[140px]" rowSpan={rowCount}>
                  {canManageStaffAndPlant ? (
                    <Select
                      value={shelf.sharedMotherPool ?? "NONE"}
                      onValueChange={(v) =>
                        patchShelf(shelf.id, { sharedMotherPool: v === "NONE" ? null : v }, "Đã cập nhật phân loại kho cho kệ")
                      }
                    >
                      <SelectTrigger className="w-full h-8 text-xs" disabled={savingId === shelf.id}>
                        <SelectValue>{() => (shelf.sharedMotherPool ? POOL_LABELS[shelf.sharedMotherPool] : "— Chưa phân loại —")}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">— Chưa phân loại —</SelectItem>
                        <SelectItem value="QUA_HAN">Kho quá hạn</SelectItem>
                        <SelectItem value="DUNG_HAN">Kho đúng hạn</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-text-secondary">{shelf.sharedMotherPool ? POOL_LABELS[shelf.sharedMotherPool] : "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 min-w-[160px]" rowSpan={rowCount}>
                  {canManageStaffAndPlant ? (
                    <AllowedCodesCell
                      shelfId={shelf.id}
                      initialCodes={shelf.allowedCodes}
                      disabled={savingId === shelf.id}
                      onSave={(id, codes) => patchShelf(id, { allowedCodes: codes }, "Đã cập nhật Cho phép xếp cho kệ")}
                    />
                  ) : (
                    <span className="text-xs text-text-secondary">{shelf.allowedCodes.length > 0 ? shelf.allowedCodes.join(", ") : "—"}</span>
                  )}
                </td>
              </>
            )}
          </>
        )}
        {idx === 0 && (
          <td className="px-3 py-2 min-w-[140px]" rowSpan={rowCount}>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span>{used.toLocaleString("vi-VN")} /</span>
              {canManageStaffAndPlant ? (
                <CapacityCell
                  shelfId={shelf.id}
                  initialCapacity={shelf.capacity}
                  disabled={savingId === shelf.id}
                  onSave={(id, capacity) => patchShelf(id, { capacity }, "Đã cập nhật sức chứa cho kệ")}
                />
              ) : (
                <span>{shelf.capacity ?? "Không giới hạn"}</span>
              )}
              <span>{isMauMeRoom ? "cụm" : "cây"}</span>
              {canMoveRoom && (
                <Button
                  type="button" variant="ghost" size="icon-sm"
                  className="shrink-0 text-text-muted hover:text-primary-strong hover:bg-primary-light"
                  onClick={() => setEditLotsShelfId(shelf.id)}
                  title="Sửa số lượng lô cây"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            {usage !== null && (
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage > 90 ? "bg-destructive" : usage > 70 ? "bg-warning" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(usage, 100)}%` }}
                />
              </div>
            )}
          </td>
        )}
        {canMoveRoom && idx === 0 && (
          <td className="px-3 py-2 min-w-[170px]" rowSpan={rowCount}>
            {used > 0 ? (
              <span className="text-xs text-text-muted" title="Chỉ chuyển được sang nhóm khác khi tồn kệ bằng 0">
                Còn tồn — không thể chuyển
              </span>
            ) : (
              (() => {
                const targets = buildMoveTargets(shelf, isChungSection);
                return targets.length > 0 ? (
                  <Select value="_" onValueChange={(v) => targets.find((t) => t.key === v)?.action()}>
                    <SelectTrigger className="w-full h-8 text-xs" disabled={savingId === shelf.id}>
                      <SelectValue>{() => "Chuyển phòng…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_" disabled>Chuyển sang…</SelectItem>
                      {targets.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-text-muted">—</span>
                );
              })()
            )}
          </td>
        )}
        {canManageStaffAndPlant && idx === 0 && (
          <td className="px-3 py-2" rowSpan={rowCount}>
            <div className="flex items-center gap-1">
              {(!isMauMeRoom || !isChungSection) && (
                <Button
                  size="sm"
                  className="h-8 px-2 bg-primary hover:bg-primary-hover"
                  disabled={rotationSavingId === shelf.id}
                  onClick={() =>
                    setRotationGroup(
                      shelf.id,
                      getRotationValue(shelf) === "NONE" ? null : getRotationValue(shelf),
                      shelf.rotationGroup?.id ?? null
                    )
                  }
                >
                  Lưu
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:bg-danger-light"
                disabled={deletingId === shelf.id}
                onClick={() => deleteShelf(shelf)}
                title="Xóa giàn kệ"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </td>
        )}
      </tr>
    );
  };

  const renderTable = (rows: Shelf[], isChungSection: boolean) => (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full">
        <thead>
          <tr className="bg-primary-light">
            {canManageStaffAndPlant && (
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={rows.length > 0 && rows.every((s) => selected[s.id])}
                  onCheckedChange={(v) => toggleSelectAll(rows, v === true)}
                />
              </th>
            )}
            <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên kệ</th>
            {!isMauMeRoom && <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Nhóm tuần ra rễ</th>}
            {isMauMeRoom && (
              <>
                {!isChungSection && (
                  <>
                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên cây chi tiết</th>
                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Nhân viên phụ trách</th>
                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Nhóm tuần mẫu mẹ</th>
                  </>
                )}
                {isChungSection && (
                  <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Mã cây đang xếp</th>
                )}
                <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Số cụm M05</th>
                {isChungSection && (
                  <>
                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Kho quá hạn/đúng hạn</th>
                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Cho phép xếp</th>
                  </>
                )}
              </>
            )}
            <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tồn / Sức chứa</th>
            {canMoveRoom && <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Chuyển phòng</th>}
            {canManageStaffAndPlant && <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Thao tác</th>}
          </tr>
        </thead>
        <tbody>{rows.map((s) => renderRows(s, isChungSection))}</tbody>
      </table>
    </div>
  );

  // Phòng mẫu mẹ tự chia làm 2 nhóm hiển thị theo việc đã gán mã cây HOẶC nhân viên hay chưa (SUPER_ADMIN
  // cấu hình ở trên) — không phải 1 Room riêng, chỉ là phân nhóm. Kệ "đã chia" có thể đã gán mã cây
  // nhưng CHƯA gán nhân viên cụ thể (VD chờ SUPER_ADMIN gán NV sau) — vẫn tính là "đã chia", không rơi
  // lại vào "chung".
  const isDaChiaShelf = (s: Shelf) => !!s.plantType || !!s.assignedStaff;
  const assignedShelves = isMauMeRoom ? shelves.filter(isDaChiaShelf) : [];
  const unassignedShelves = isMauMeRoom ? shelves.filter((s) => !isDaChiaShelf(s)) : [];

  return (
    <>
      {canManageStaffAndPlant && shelves.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleSelectAll(shelves, selectedIds.length < shelves.length)}
          >
            {selectedIds.length < shelves.length ? `Chọn tất cả (${shelves.length} kệ)` : "Bỏ chọn tất cả"}
          </Button>
          {selectedIds.length > 0 && (
            <>
              <span className="text-text-secondary">Đã chọn {selectedIds.length} kệ</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={bulkDeleting}
                onClick={deleteSelectedShelves}
              >
                {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                Xóa đã chọn
              </Button>
            </>
          )}
        </div>
      )}

      {isMauMeRoom && section ? (
        renderTable(shelves, section === "CHUNG")
      ) : isMauMeRoom ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2">
              Kho mẫu mẹ đã chia <span className="font-normal text-text-muted">({assignedShelves.length} kệ)</span>
            </p>
            {assignedShelves.length === 0 ? (
              <p className="text-xs text-text-muted pl-1">Chưa có kệ nào được gán mã cây</p>
            ) : renderTable(assignedShelves, false)}
          </div>
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2">
              Kho mẫu mẹ chung <span className="font-normal text-text-muted">({unassignedShelves.length} kệ)</span>
            </p>
            {unassignedShelves.length === 0 ? (
              <p className="text-xs text-text-muted pl-1">Không còn kệ nào chưa gán mã cây</p>
            ) : renderTable(unassignedShelves, true)}
          </div>
        </div>
      ) : (
        renderTable(shelves, false)
      )}

      <Dialog open={!!qrShelf} onOpenChange={() => setQrShelf(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code {qrShelf?.name}</DialogTitle>
          </DialogHeader>
          {qrShelf && (
            <div className="text-center space-y-3">
              {/* value vẫn dùng shelf.code thật để hệ thống quét/tra cứu nhận diện đúng kệ (xem
                  GET /api/shelves?code=...) — chỉ không hiện chữ mã kệ ra màn hình theo yêu cầu. */}
              <QRCodeDisplay value={qrShelf.code} size={200} />
              <p className="text-sm font-medium">{qrShelf.name}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                In QR Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editLotsShelf} onOpenChange={(open) => { if (!open) setEditLotsShelfId(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sửa số lượng lô cây — {editLotsShelf?.name}</DialogTitle>
          </DialogHeader>
          {editLotsShelf && (
            <div className="space-y-3">
              {editLotsShelf.lots.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">Kệ này hiện không còn lô nào</p>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-3 py-2 text-xs text-primary-strong font-bold">Mã lô</th>
                        <th className="text-left px-3 py-2 text-xs text-primary-strong font-bold">Mã cây</th>
                        <th className="text-left px-3 py-2 text-xs text-primary-strong font-bold">Quy cách</th>
                        <th className="text-left px-3 py-2 text-xs text-primary-strong font-bold">Số lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editLotsShelf.lots.map((lot) => (
                        <LotQuantityRow
                          key={lot.id}
                          lot={lot}
                          unit={isMauMeRoom ? "cụm" : "cây"}
                          onSave={saveLotQuantity}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(currentRoomType === "PHONG_MAU_ME" || currentRoomType === "PHONG_RA_RE") && plantTypeOptions.length > 0 && (
                <AddLotForm
                  shelfId={editLotsShelf.id}
                  warehouseId={editLotsShelf.warehouseId}
                  roomType={currentRoomType}
                  plantTypeOptions={plantTypeOptions.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  unit={isMauMeRoom ? "cụm" : "cây"}
                  onAdded={() => router.refresh()}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!assignStaffTarget}
        onOpenChange={(open) => {
          if (!open) { setAssignStaffTarget(null); setAssignStaffValue(null); setAssignPlantTypeValue(null); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Chuyển kệ {assignStaffTarget?.name} sang Kho mẫu mẹ đã chia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-text-secondary">Chọn nhân viên phụ trách cho kệ này:</p>
              <Combobox
                items={staffComboboxOptions.filter((o) => o.value !== "NONE")}
                value={assignStaffValue}
                isItemEqualToValue={(a, b) => a.value === b.value}
                onValueChange={(v) => setAssignStaffValue(v)}
              >
                <ComboboxInputGroup className="w-full h-9">
                  <ComboboxInput className="text-sm" placeholder="Gõ tên hoặc mã NV…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy nhân viên</ComboboxEmpty>
                  <ComboboxList>
                    {(item: { value: string; label: string }) => (
                      <ComboboxItem key={item.value} value={item} className="text-sm">
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-text-secondary">Chọn mã cây cho kệ này (kệ đã chia chỉ nhận đúng 1 mã cây):</p>
              <Combobox
                items={plantTypeComboboxOptions.filter((o) => o.value !== "NONE")}
                value={assignPlantTypeValue}
                isItemEqualToValue={(a, b) => a.value === b.value}
                onValueChange={(v) => setAssignPlantTypeValue(v)}
              >
                <ComboboxInputGroup className="w-full h-9">
                  <ComboboxInput className="text-sm" placeholder="Gõ mã hoặc tên cây…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                  <ComboboxList>
                    {(item: { value: string; label: string }) => (
                      <ComboboxItem key={item.value} value={item} className="text-sm">
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setAssignStaffTarget(null); setAssignStaffValue(null); setAssignPlantTypeValue(null); }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!assignStaffValue || !assignPlantTypeValue || savingId === assignStaffTarget?.id}
                onClick={confirmAssignToDaChia}
              >
                Xác nhận
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
