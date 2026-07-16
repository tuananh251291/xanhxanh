"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Package, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  rowNumber: number | null;
  colNumber: number | null;
  capacity: number | null;
  plantType: PlantType | null;
  assignedStaff: Staff | null;
  sharedMotherPool: "QUA_HAN" | "DUNG_HAN" | null;
  allowedCodes: string[];
  rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
  lots: { quantity: number; stageCode: string }[];
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

// Sức chứa (đơn vị túi) — Admin cấp cao cài đặt số ban đầu lúc tạo kệ (xem add-shelves-dialog.tsx),
// sửa lại sau tại đây. Để trống = không giới hạn (lưu null).
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

export default function ShelfTable({
  shelves,
  currentRoomId,
  currentRoomType,
  staffOptions = [],
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const router = useRouter();
  const isMauMeRoom = currentRoomType === "PHONG_MAU_ME";
  const otherRooms = moveableRooms.filter((r) => r.id !== currentRoomId);
  const motherRoom = moveableRooms.find((r) => r.type === "PHONG_MAU_ME");
  const raReRoom = moveableRooms.find((r) => r.type === "PHONG_RA_RE");

  // Danh sách gõ-tìm cho combobox "Nhân viên phụ trách" — gõ tên/mã sẽ tự lọc gợi ý.
  const staffComboboxOptions = useMemo(
    () => [
      { value: "NONE", label: "— Chưa gán nhân viên —" },
      ...staffOptions.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })),
    ],
    [staffOptions]
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
    const confirmMsg = shelf.lots.length > 0
      ? `Giàn kệ ${shelf.name} đang có ${shelf.lots.length} lô cây (tổng ${totalQty.toLocaleString("vi-VN")} cây/túi). Xóa kệ sẽ không xóa dữ liệu lô nhưng kệ sẽ biến mất khỏi danh sách đang hoạt động. Bạn có chắc chắn muốn xóa?`
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
    const confirmMsg = totalLots > 0
      ? `Xóa ${targets.length} giàn kệ đã chọn? Trong đó có ${totalLots} lô cây (tổng ${totalQty.toLocaleString("vi-VN")} cây/túi) — xóa kệ sẽ không xóa dữ liệu lô nhưng kệ sẽ biến mất khỏi danh sách đang hoạt động.`
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
    if (!assignStaffTarget || !assignStaffValue || assignStaffValue.value === "NONE" || !motherRoom) return;
    await patchShelf(
      assignStaffTarget.id,
      { roomId: motherRoom.id, assignedStaffId: assignStaffValue.value },
      `Đã chuyển kệ ${assignStaffTarget.name} sang Kho mẫu mẹ đã chia`
    );
    setAssignStaffTarget(null);
    setAssignStaffValue(null);
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
    if (!inChung && motherRoom) {
      targets.push({
        key: "CHUNG",
        label: "Kho mẫu mẹ chung",
        action: () =>
          patchShelf(shelf.id, { roomId: motherRoom.id, assignedStaffId: null }, `Đã chuyển kệ ${shelf.name} sang Kho mẫu mẹ chung`),
      });
    }
    if (!inDaChia && motherRoom) {
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

  const renderRow = (shelf: Shelf, isChungSection: boolean) => {
    const used = sumLotQuantity(shelf.lots);
    const usage = shelf.capacity ? Math.round((used / shelf.capacity) * 100) : null;
    const bagsBySpec = shelf.lots.reduce<Record<string, number>>((acc, l) => {
      acc[l.stageCode] = (acc[l.stageCode] ?? 0) + l.quantity;
      return acc;
    }, {});
    return (
      <tr key={shelf.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
        {canManageStaffAndPlant && (
          <td className="px-3 py-2 w-8">
            <Checkbox checked={!!selected[shelf.id]} onCheckedChange={(v) => toggleSelect(shelf.id, v === true)} />
          </td>
        )}
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            className="flex items-center gap-1.5 text-left"
            onClick={() => setQrShelf(shelf)}
            title="Xem QR"
          >
            <span className="text-sm font-bold text-foreground">{shelf.name}</span>
            <QrCode className="w-3.5 h-3.5 text-text-muted shrink-0" />
          </button>
        </td>
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
                <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
                  {shelf.plantType?.name ?? "—"}
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
            <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
              {Object.keys(bagsBySpec).length === 0
                ? "—"
                : Object.entries(bagsBySpec)
                    .map(([spec, qty]) => `${spec}: ${qty} túi`)
                    .join(" · ")}
            </td>
            {isChungSection && (
              <>
                <td className="px-3 py-2 min-w-[140px]">
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
                <td className="px-3 py-2 min-w-[160px]">
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
        <td className="px-3 py-2 min-w-[140px]">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Package className="w-3 h-3 text-primary-strong shrink-0" />
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
            <span>túi</span>
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
        {canMoveRoom && (
          <td className="px-3 py-2 min-w-[170px]">
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
        {canManageStaffAndPlant && (
          <td className="px-3 py-2">
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
                <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Số túi M03/M05</th>
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
        <tbody>{rows.map((s) => renderRow(s, isChungSection))}</tbody>
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

      <Dialog
        open={!!assignStaffTarget}
        onOpenChange={(open) => {
          if (!open) { setAssignStaffTarget(null); setAssignStaffValue(null); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Chuyển kệ {assignStaffTarget?.name} sang Kho mẫu mẹ đã chia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setAssignStaffTarget(null); setAssignStaffValue(null); }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!assignStaffValue || savingId === assignStaffTarget?.id}
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
