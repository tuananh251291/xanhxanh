"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UserRole, EmploymentType } from "@prisma/client";
import { EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPE_COLORS, TRAINEE_LABEL, TRAINEE_BADGE_COLOR } from "@/types";
import EditUserDialog, { type EditableUser } from "./edit-user-dialog";
import UnlockAccountCell from "./unlock-account-cell";
import DeleteUserButton from "./delete-user-button";

type WarehouseOption = { id: string; code: string; name: string };

// Gộp 3 cột "Vị trí làm việc" / "Năng lực cấy" / "Giữ đơn (ngày)" + cột "Thao tác" (nút Chỉnh sửa +
// Lưu cạnh nhau) của 1 dòng nhân viên thành 1 component để cùng chia sẻ state "đang sửa chưa lưu" —
// người dùng đổi lựa chọn/nhập số xong bấm "Lưu" mới thực sự PATCH lên server, thay vì lưu ngay từng ô
// như trước (dễ bấm nhầm/đổi ý giữa chừng).
export default function UserEditableFields({
  userId,
  role,
  canApprove,
  canEditCapacity,
  canEditWorkplace: canAssignWorkplace,
  isWorkplaceRole,
  workplaceWarehouseId,
  workplaceWarehouse,
  warehouseOptions,
  plantingCapacity,
  holdDays,
  employmentType,
  isTrainee,
  canEditEmployment,
  editUser,
  sanXuatWarehouses,
  thanhPhamWarehouses,
  lockedAt,
}: {
  userId: string;
  role: UserRole | null;
  canApprove: boolean;
  canEditCapacity: boolean;
  canEditWorkplace: boolean;
  isWorkplaceRole: boolean;
  workplaceWarehouseId: string | null;
  workplaceWarehouse: { code: string; name: string } | null;
  warehouseOptions: WarehouseOption[];
  plantingCapacity: number;
  holdDays: number | null;
  employmentType: EmploymentType | null;
  isTrainee: boolean;
  canEditEmployment: boolean;
  // null = không được sửa tài khoản này (không phải SUPER_ADMIN, hoặc dòng này là SUPER_ADMIN khác) —
  // cũng dùng chung điều kiện này để hiện nút Xóa (server tự chặn thêm trường hợp tự xóa chính mình).
  editUser: EditableUser | null;
  sanXuatWarehouses: WarehouseOption[];
  thanhPhamWarehouses: WarehouseOption[];
  lockedAt: Date | null;
}) {
  const canEditWorkplace = isWorkplaceRole && canAssignWorkplace;
  const canEditThisCapacity = role === "CAY_MO" && canEditCapacity;
  const canEditThisHoldDays = role === "SALE" && canEditCapacity;
  const canEditThisEmployment = role === "CAY_MO" && canEditEmployment;

  const [wp, setWp] = useState(workplaceWarehouseId ?? "NONE");
  const [cap, setCap] = useState(String(plantingCapacity));
  const [hd, setHd] = useState(holdDays != null ? String(holdDays) : "");
  const [emp, setEmp] = useState(employmentType ?? "NONE");
  const [trn, setTrn] = useState(isTrainee);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Prop mới (sau router.refresh() từ 1 lần lưu thành công, hoặc dòng khác trong bảng vừa đổi) đồng bộ
  // lại state cục bộ để input luôn khớp dữ liệu đã lưu thật trên server — chỉnh state ngay trong lúc
  // render (theo khuyến nghị React cho "adjust state when a prop changes") thay vì dùng useEffect, tránh
  // 1 lượt render thừa và vi phạm rule react-hooks/set-state-in-effect.
  const [prevWorkplaceWarehouseId, setPrevWorkplaceWarehouseId] = useState(workplaceWarehouseId);
  if (workplaceWarehouseId !== prevWorkplaceWarehouseId) {
    setPrevWorkplaceWarehouseId(workplaceWarehouseId);
    setWp(workplaceWarehouseId ?? "NONE");
  }
  const [prevPlantingCapacity, setPrevPlantingCapacity] = useState(plantingCapacity);
  if (plantingCapacity !== prevPlantingCapacity) {
    setPrevPlantingCapacity(plantingCapacity);
    setCap(String(plantingCapacity));
  }
  const [prevHoldDays, setPrevHoldDays] = useState(holdDays);
  if (holdDays !== prevHoldDays) {
    setPrevHoldDays(holdDays);
    setHd(holdDays != null ? String(holdDays) : "");
  }
  const [prevEmploymentType, setPrevEmploymentType] = useState(employmentType);
  if (employmentType !== prevEmploymentType) {
    setPrevEmploymentType(employmentType);
    setEmp(employmentType ?? "NONE");
  }
  const [prevIsTrainee, setPrevIsTrainee] = useState(isTrainee);
  if (isTrainee !== prevIsTrainee) {
    setPrevIsTrainee(isTrainee);
    setTrn(isTrainee);
  }

  const wpDirty = canEditWorkplace && wp !== (workplaceWarehouseId ?? "NONE");
  const capDirty = canEditThisCapacity && cap !== String(plantingCapacity);
  const hdDirty = canEditThisHoldDays && hd !== (holdDays != null ? String(holdDays) : "");
  const empDirty = canEditThisEmployment && emp !== (employmentType ?? "NONE");
  const trnDirty = canEditThisEmployment && trn !== isTrainee;
  const dirty = wpDirty || capDirty || hdDirty || empDirty || trnDirty;

  const patch = (body: Record<string, unknown>) =>
    fetch(`/api/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const save = async () => {
    let parsedCap: number | null = null;
    if (capDirty) {
      parsedCap = parseInt(cap, 10);
      if (!Number.isFinite(parsedCap) || parsedCap <= 0) {
        toast.error("Năng lực cấy phải là số nguyên dương");
        return;
      }
    }
    let parsedHd: number | null = null;
    if (hdDirty && hd.trim() !== "") {
      parsedHd = parseInt(hd, 10);
      if (!Number.isFinite(parsedHd) || parsedHd <= 0) {
        toast.error("Năng lực giữ đơn phải là số nguyên dương");
        return;
      }
    }

    setSaving(true);
    try {
      if (wpDirty) {
        const res = await patch({ workplaceWarehouseId: wp === "NONE" ? null : wp });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      if (capDirty) {
        const res = await patch({ plantingCapacity: parsedCap });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      if (hdDirty) {
        const res = await patch({ holdDays: hd.trim() === "" ? null : parsedHd });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      if (empDirty) {
        const res = await patch({ employmentType: emp === "NONE" ? null : emp });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      if (trnDirty) {
        const res = await patch({ isTrainee: trn });
        if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      }
      toast.success("Đã lưu thay đổi");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <td className="px-4 py-3">
        {isWorkplaceRole ? (
          canEditWorkplace ? (
            <Select
              items={[{ value: "NONE", label: "— Chưa gán —" }, ...warehouseOptions.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
              value={wp}
              onValueChange={(v) => setWp(v as string)}
            >
              <SelectTrigger className="w-52 h-8 text-xs" disabled={saving}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Chưa gán —</SelectItem>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-text-secondary">
              {workplaceWarehouse ? `${workplaceWarehouse.name} (${workplaceWarehouse.code})` : "Chưa gán"}
            </span>
          )
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {role === "CAY_MO" ? (
          canEditThisEmployment ? (
            <div className="space-y-1.5">
              <Select
                items={[{ value: "NONE", label: "— Chưa cài đặt —" }, ...(Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, label]) => ({ value: v, label })))]}
                value={emp}
                onValueChange={(v) => setEmp(v as EmploymentType | "NONE")}
              >
                <SelectTrigger className="w-36 h-8 text-xs" disabled={saving}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— Chưa cài đặt —</SelectItem>
                  {(Object.entries(EMPLOYMENT_TYPE_LABELS) as [EmploymentType, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                <Checkbox checked={trn} disabled={saving} onCheckedChange={(v) => setTrn(v === true)} />
                {TRAINEE_LABEL}
              </label>
            </div>
          ) : employmentType || isTrainee ? (
            <div className="flex flex-wrap gap-1">
              {employmentType && <Badge className={EMPLOYMENT_TYPE_COLORS[employmentType]}>{EMPLOYMENT_TYPE_LABELS[employmentType]}</Badge>}
              {isTrainee && <Badge className={TRAINEE_BADGE_COLOR}>{TRAINEE_LABEL}</Badge>}
            </div>
          ) : (
            <span className="text-xs text-text-muted">Chưa cài đặt</span>
          )
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {role === "CAY_MO" ? (
          canEditThisCapacity ? (
            <Input
              type="number"
              min={1}
              className="w-24 h-8 text-xs"
              value={cap}
              disabled={saving}
              onChange={(e) => setCap(e.target.value)}
            />
          ) : (
            <span className="text-xs text-text-secondary">{plantingCapacity.toLocaleString("vi-VN")}</span>
          )
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {role === "SALE" ? (
          canEditThisHoldDays ? (
            <Input
              type="number"
              min={1}
              className="w-20 h-8 text-xs"
              value={hd}
              placeholder="—"
              disabled={saving}
              onChange={(e) => setHd(e.target.value)}
            />
          ) : (
            <span className="text-xs text-text-secondary">{holdDays != null ? holdDays.toLocaleString("vi-VN") : "—"}</span>
          )
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {lockedAt ? (
          <div className="flex items-center gap-2">
            <Badge className="bg-danger-light text-destructive">Đã khóa</Badge>
            {canApprove && <UnlockAccountCell userId={userId} />}
          </div>
        ) : (
          <span className="text-xs text-text-muted">Bình thường</span>
        )}
      </td>
      {(canApprove || canEditCapacity || canEditEmployment) && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {editUser && (
              <EditUserDialog user={editUser} sanXuatWarehouses={sanXuatWarehouses} thanhPhamWarehouses={thanhPhamWarehouses} />
            )}
            {editUser && <DeleteUserButton id={editUser.id} code={editUser.code} name={editUser.name} />}
            {(canEditWorkplace || canEditThisCapacity || canEditThisHoldDays || canEditThisEmployment) && (
              <Button
                size="icon-sm"
                className="bg-primary hover:bg-primary-hover"
                disabled={!dirty || saving}
                onClick={save}
                title="Lưu"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span className="sr-only">Lưu</span>
              </Button>
            )}
            {!editUser && !(canEditWorkplace || canEditThisCapacity || canEditThisHoldDays || canEditThisEmployment) && (
              <span className="text-xs text-text-muted">—</span>
            )}
          </div>
        </td>
      )}
    </>
  );
}
