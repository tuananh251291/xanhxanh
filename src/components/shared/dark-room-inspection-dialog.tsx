"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DARK_ROOM_CHECK_VIOLATION_GROUPS } from "@/types";

type Staff = { id: string; code: string; name: string; role: string };
type ViolationType = { id: string; label: string; groupName: string | null };
type ComboOption = { value: string; label: string };

const ALLOWED_GROUPS: readonly string[] = DARK_ROOM_CHECK_VIOLATION_GROUPS;

// Nhiệm vụ nhỏ "Kiểm tra kho cá nhân" (thuộc checklist "Kiểm tra kho tối") — NV kho mô chọn 0 hoặc 1 NV
// cấy mô + 0 hoặc nhiều lỗi vi phạm tìm thấy, bấm "Hoàn tất kiểm tra". KHÔNG bắt buộc phải chọn đích danh
// 1 NV mới hoàn thành được — không chọn ai nghĩa là "đã kiểm tra, không có vi phạm nào cần ghi nhận cho
// ai cụ thể" (VD không còn NV cấy mô nào để chọn, hoặc chỉ muốn xác nhận nhanh không phát hiện gì bất
// thường). Xong 1 lượt là tính xong nhiệm vụ nhỏ 1 trong ngày (không bắt buộc đi hết mọi NV cấy mô) — có
// thể mở lại nhiều lần/ngày nếu muốn kiểm tra thêm.
// Danh sách lỗi chỉ hiện đúng 2 nhóm liên quan tới kiểm tra kho tối (DARK_ROOM_CHECK_VIOLATION_GROUPS) —
// đúng phạm vi thực tế đi kiểm tra (tem nhãn + sắp xếp sản phẩm), không còn cho thêm loại lỗi mới ngay
// tại đây nữa (danh mục lỗi giờ quản lý tập trung ở trang Danh sách lỗi vi phạm, xem
// /violation-types), server cũng validate lại đúng 2 nhóm này (xem POST /api/dark-room-inspection).
export default function DarkRoomInspectionDialog({
  checklistItemId,
  onSaved,
}: {
  checklistItemId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [violationTypes, setViolationTypes] = useState<ViolationType[]>([]);
  const [staffOption, setStaffOption] = useState<ComboOption | null>(null);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users").then((r) => r.json()).then((d) => setStaffList(Array.isArray(d) ? d.filter((u: Staff) => u.role === "CAY_MO") : []));
    fetch("/api/violation-types").then((r) => r.json()).then((d) => setViolationTypes(Array.isArray(d) ? d : []));
  }, [open]);

  const staffOptions = useMemo(() => staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })), [staffList]);
  // Chỉ cho chọn lỗi thuộc 2 nhóm liên quan tới kiểm tra kho tối — xem DARK_ROOM_CHECK_VIOLATION_GROUPS,
  // gộp hiển thị theo từng nhóm cho dễ theo dõi (khớp cách hiển thị ở trang Danh sách lỗi vi phạm).
  const groupedViolationTypes = useMemo(() => {
    const relevant = violationTypes.filter((t) => t.groupName && ALLOWED_GROUPS.includes(t.groupName));
    return ALLOWED_GROUPS.map((groupName) => ({
      groupName,
      items: relevant.filter((t) => t.groupName === groupName),
    })).filter((g) => g.items.length > 0);
  }, [violationTypes]);

  const resetForm = () => {
    setStaffOption(null);
    setSelectedTypeIds([]);
  };

  const toggleType = (id: string) => {
    setSelectedTypeIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/dark-room-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklistItemId,
          staffId: staffOption?.value,
          // Không chọn NV thì không gửi kèm lỗi vi phạm (không có ai để gắn lỗi vào) — server cũng chặn
          // lại trường hợp này, chặn sớm ở đây cho gọn.
          violationTypeIds: staffOption ? selectedTypeIds : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        !staffOption
          ? "Đã ghi nhận đợt kiểm tra — không có vi phạm nào"
          : selectedTypeIds.length > 0
            ? `Đã ghi nhận ${selectedTypeIds.length} lỗi vi phạm cho ${staffOption.label}`
            : `Đã kiểm tra ${staffOption.label} — không có vi phạm`
      );
      resetForm();
      setOpen(false);
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 px-2 text-text-secondary" />}>
        <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Ghi nhận kiểm tra
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Kiểm tra kho cá nhân</DialogTitle></DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label className="text-sm">NV cấy mô được kiểm tra (không bắt buộc)</Label>
            <Combobox
              items={staffOptions}
              value={staffOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={setStaffOption}
            >
              <ComboboxInputGroup className="w-full h-9">
                <ComboboxInput placeholder="Gõ tên hoặc mã NV… (bỏ trống nếu không có vi phạm nào cần ghi)" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy NV cấy mô</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {staffOption && (
            <div className="space-y-2">
              <Label className="text-sm">Lỗi vi phạm (bỏ trống nếu NV đạt)</Label>
              {groupedViolationTypes.length === 0 ? (
                <p className="text-sm text-text-muted p-3 rounded-lg border border-divider">
                  Chưa có lỗi nào thuộc nhóm Tem nhãn và truy xuất / Kho, khay và sắp xếp sản phẩm — thêm ở trang Danh sách lỗi vi phạm
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-2">
                  {groupedViolationTypes.map((g) => (
                    <div key={g.groupName} className="space-y-1">
                      <p className="text-xs font-semibold text-text-secondary">{g.groupName}</p>
                      <div className="rounded-lg border border-divider divide-y divide-divider">
                        {g.items.map((t) => (
                          <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                            <Checkbox checked={selectedTypeIds.includes(t.id)} onCheckedChange={() => toggleType(t.id)} />
                            <span>{t.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Hoàn tất kiểm tra
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
