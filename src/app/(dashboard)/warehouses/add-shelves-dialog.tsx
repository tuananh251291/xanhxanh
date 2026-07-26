"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Loader2, Layers, X } from "lucide-react";
import { toast } from "sonner";

type Staff = { id: string; code: string; name: string };
type PlantType = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };

const SHARED_POOL_OPTIONS: { value: "NONE" | "DUNG_HAN" | "QUA_HAN"; label: string }[] = [
  { value: "NONE", label: "Chưa phân loại" },
  { value: "DUNG_HAN", label: "Đúng hạn" },
  { value: "QUA_HAN", label: "Quá hạn" },
];

const lineSchema = z.object({
  row: z
    .string()
    .trim()
    .regex(/^[A-Za-z]$/, "Hàng phải là 1 chữ cái A-Z")
    .transform((v) => v.toUpperCase()),
  rowFrom: z.number().int().min(1).max(99),
  rowTo: z.number().int().min(1).max(99),
  colFrom: z.number().int().min(1),
  colTo: z.number().int().min(1),
});

const schema = z.object({
  lines: z.array(lineSchema).min(1),
  capacity: z.number().int().positive().optional(),
});

type FormData = z.infer<typeof schema>;

const nextRowLetter = (row: string) => {
  const code = row.toUpperCase().charCodeAt(0);
  return code < 90 ? String.fromCharCode(code + 1) : "A";
};

export default function AddShelvesDialog({
  roomId, roomCode, roomType, caymoStaff = [], plantTypes = [], canAssignStaff = false,
}: {
  roomId: string;
  roomCode: string;
  roomType: "PHONG_MAU_ME" | "PHONG_RA_RE";
  caymoStaff?: Staff[];
  plantTypes?: PlantType[];
  canAssignStaff?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isMauMe = roomType === "PHONG_MAU_ME";
  const showPoolSection = isMauMe && canAssignStaff;

  const [poolType, setPoolType] = useState<"SHARED" | "ASSIGNED">("SHARED");
  const [assignedStaffId, setAssignedStaffId] = useState("");
  const [sharedMotherPool, setSharedMotherPool] = useState<"NONE" | "DUNG_HAN" | "QUA_HAN">("NONE");
  const [plantTypeValue, setPlantTypeValue] = useState<ComboOption | null>(null);
  const resetPoolState = () => {
    setPoolType("SHARED");
    setAssignedStaffId("");
    setSharedMotherPool("NONE");
    setPlantTypeValue(null);
  };
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }));

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { lines: [{ row: "A", rowFrom: 1, rowTo: 1, colFrom: 1, colTo: 5 }], capacity: undefined },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const lines = watch("lines");
  const previewCount = lines.reduce((sum, l) => {
    const valid =
      /^[A-Za-z]$/.test(l.row ?? "") &&
      [l.rowFrom, l.rowTo, l.colFrom, l.colTo].every((v) => Number.isFinite(v)) &&
      l.rowFrom >= 1 && l.rowFrom <= 99 && l.rowTo >= l.rowFrom && l.rowTo <= 99 &&
      l.colTo >= l.colFrom;
    return sum + (valid ? (l.rowTo - l.rowFrom + 1) * (l.colTo - l.colFrom + 1) : 0);
  }, 0);

  const addLine = () => {
    const last = lines[lines.length - 1];
    append({
      row: nextRowLetter(last?.row ?? "A"),
      rowFrom: last?.rowFrom ?? 1,
      rowTo: last?.rowTo ?? 1,
      colFrom: last?.colFrom ?? 1,
      colTo: last?.colTo ?? 5,
    });
  };

  const onSubmit = async (data: FormData) => {
    for (const line of data.lines) {
      if (line.rowFrom > line.rowTo) {
        toast.error(`Hàng ${line.row}: khoảng số hàng không hợp lệ`);
        return;
      }
      if (line.colFrom > line.colTo) {
        toast.error(`Hàng ${line.row}: khoảng cột không hợp lệ`);
        return;
      }
    }
    if (showPoolSection && poolType === "ASSIGNED" && !assignedStaffId) {
      toast.error("Chọn nhân viên phụ trách cho kệ đã chia");
      return;
    }
    const poolFields =
      showPoolSection && poolType === "ASSIGNED"
        ? { assignedStaffId, ...(plantTypeValue ? { plantTypeId: plantTypeValue.value } : {}) }
        : showPoolSection && sharedMotherPool !== "NONE"
          ? { sharedMotherPool }
          : {};
    setLoading(true);
    try {
      // Gộp mọi hàng vào 1 request duy nhất — server xử lý atomic trong 1 transaction, tránh trường
      // hợp gọi API tuần tự từng hàng: hàng giữa chừng lỗi thì các hàng trước đã tạo thật nhưng chỉ
      // báo lỗi chung, khiến Admin tưởng chưa tạo gì.
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, lines: data.lines, capacity: data.capacity, ...poolFields }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        json.skippedCodes.length > 0
          ? `Đã tạo ${json.createdCount} kệ mới — bỏ qua ${json.skippedCodes.length} kệ đã có mã trùng`
          : `Đã tạo ${json.createdCount} kệ mới`
      );
      setOpen(false);
      reset();
      resetPoolState();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm giàn kệ
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> Thêm giàn kệ — {roomCode}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <p className="text-xs text-text-secondary">
            Tạo nhiều kệ cùng lúc theo lưới chữ hàng × số hàng × cột, có thể thêm nhiều dòng khác nhau trong 1
            lần — mã kệ tự sinh dạng {roomCode}-D01C03 (hàng D, số hàng 01, cột 03). Số hàng nhập tay (01–99),
            không cần khớp thứ tự bảng chữ cái, có thể nhập cả khoảng (VD số hàng 1 đến 2).
          </p>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] gap-2 items-start">
                <div className="space-y-1">
                  {index === 0 && <Label>Hàng</Label>}
                  <Input maxLength={1} className="uppercase" placeholder="A" {...register(`lines.${index}.row`)} />
                  {errors.lines?.[index]?.row && <p className="text-xs text-destructive">{errors.lines[index]?.row?.message}</p>}
                </div>
                <div className="space-y-1">
                  {index === 0 && <Label>Số hàng từ</Label>}
                  <Input type="number" min={1} max={99} placeholder="01" {...register(`lines.${index}.rowFrom`, { valueAsNumber: true })} />
                  {errors.lines?.[index]?.rowFrom && <p className="text-xs text-destructive">{errors.lines[index]?.rowFrom?.message}</p>}
                </div>
                <div className="space-y-1">
                  {index === 0 && <Label>Số hàng đến</Label>}
                  <Input type="number" min={1} max={99} placeholder="01" {...register(`lines.${index}.rowTo`, { valueAsNumber: true })} />
                  {errors.lines?.[index]?.rowTo && <p className="text-xs text-destructive">{errors.lines[index]?.rowTo?.message}</p>}
                </div>
                <div className="space-y-1">
                  {index === 0 && <Label>Cột từ</Label>}
                  <Input type="number" min={1} {...register(`lines.${index}.colFrom`, { valueAsNumber: true })} />
                </div>
                <div className="space-y-1">
                  {index === 0 && <Label>Cột đến</Label>}
                  <Input type="number" min={1} {...register(`lines.${index}.colTo`, { valueAsNumber: true })} />
                </div>
                <div className="space-y-1">
                  {index === 0 && <Label className="invisible">Xóa</Label>}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <X className="w-4 h-4 text-text-muted" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Thêm hàng
          </Button>
          <div className="space-y-1">
            <Label>Sức chứa mỗi kệ ({isMauMe ? "cụm" : "cây"})</Label>
            <Input
              type="number"
              min={1}
              {...register("capacity", { valueAsNumber: true })}
              placeholder="Không giới hạn nếu để trống"
            />
          </div>
          {showPoolSection && (
            <div className="space-y-2 border border-divider rounded-lg p-3 bg-muted/30">
              <Label>Phân loại kệ (áp dụng cho cả lô đang tạo)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={poolType === "SHARED" ? "default" : "outline"}
                  className={poolType === "SHARED" ? "bg-primary hover:bg-primary-hover" : ""}
                  onClick={() => setPoolType("SHARED")}
                >
                  Kho mẫu mẹ chung
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={poolType === "ASSIGNED" ? "default" : "outline"}
                  className={poolType === "ASSIGNED" ? "bg-primary hover:bg-primary-hover" : ""}
                  onClick={() => setPoolType("ASSIGNED")}
                >
                  Kho mẫu mẹ đã chia
                </Button>
              </div>
              {poolType === "SHARED" ? (
                <Select
                  items={SHARED_POOL_OPTIONS}
                  value={sharedMotherPool}
                  onValueChange={(v) => setSharedMotherPool(v as typeof sharedMotherPool)}
                >
                  <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHARED_POOL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Select
                    items={caymoStaff.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                    value={assignedStaffId}
                    onValueChange={(v) => setAssignedStaffId(v as string)}
                  >
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Chọn nhân viên phụ trách" /></SelectTrigger>
                    <SelectContent>
                      {caymoStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Combobox
                    items={plantTypeOptions}
                    value={plantTypeValue}
                    isItemEqualToValue={(a, b) => a.value === b.value}
                    onValueChange={(v) => setPlantTypeValue(v)}
                  >
                    <ComboboxInputGroup className="w-full h-9">
                      <ComboboxInput className="text-sm" placeholder="Gõ tên hoặc mã cây… (không bắt buộc)" />
                      <ComboboxTrigger />
                    </ComboboxInputGroup>
                    <ComboboxContent>
                      <ComboboxEmpty>Không tìm thấy loại cây</ComboboxEmpty>
                      <ComboboxList>
                        {(item: ComboOption) => (
                          <ComboboxItem key={item.value} value={item} className="text-sm">
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-primary-strong bg-primary-light rounded-md px-3 py-2">
            Sẽ tạo tối đa <strong>{previewCount}</strong> kệ (tự bỏ qua kệ đã có mã trùng).
          </p>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading || previewCount === 0}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tạo kệ
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
