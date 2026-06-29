"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Calculator } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  plantTypeId: z.string().min(1, "Chọn loại cây"),
  mediumTypeId: z.string().optional(),
  assignedToId: z.string().min(1, "Chọn nhân viên cấy"),
  inputMotherQuantity: z.coerce.number().int().positive("Số lượng > 0"),
  motherSampleRatio: z.coerce.number().positive().optional(),
  rootingRatio: z.coerce.number().positive().optional(),
  weekStart: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type PlantType = { id: string; code: string; name: string };
type MediumType = { id: string; code: string; name: string };
type User = { id: string; name: string };

export default function CreateInstructionDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [mediumTypes, setMediumTypes] = useState<MediumType[]>([]);
  const [staffList, setStaffList] = useState<User[]>([]);
  const router = useRouter();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
  });

  const inputQty = watch("inputMotherQuantity");
  const motherRatio = watch("motherSampleRatio");
  const rootingRatio = watch("rootingRatio");
  const expectedMother = motherRatio && inputQty ? Math.floor(inputQty * motherRatio) : null;
  const expectedFinished = rootingRatio && expectedMother ? Math.floor(expectedMother * rootingRatio) : null;

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/plant-types").then((r) => r.json()),
      fetch("/api/medium-types").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]).then(([plants, mediums, users]) => {
      setPlantTypes(plants);
      setMediumTypes(mediums);
      setStaffList(users.filter((u: User & { role: string }) => u.role === "CAY_MO"));
    });
  }, [open]);

  const onSubmit = async (data: FormData): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Tạo chỉ định cấy thành công");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button className="bg-green-600 hover:bg-green-700">
          <Plus className="w-4 h-4 mr-2" /> Tạo chỉ định cấy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tạo chỉ định cấy mới</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-4 mt-2">

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Loại cây <span className="text-red-500">*</span></Label>
              <Select onValueChange={(v) => setValue("plantTypeId", v as string)}>
                <SelectTrigger><SelectValue placeholder="Chọn loại cây" /></SelectTrigger>
                <SelectContent>
                  {plantTypes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.plantTypeId && <p className="text-xs text-red-500">{errors.plantTypeId.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Môi trường</Label>
              <Select onValueChange={(v) => setValue("mediumTypeId", v as string)}>
                <SelectTrigger><SelectValue placeholder="Chọn MT" /></SelectTrigger>
                <SelectContent>
                  {mediumTypes.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Nhân viên cấy <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => setValue("assignedToId", v as string)}>
              <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.assignedToId && <p className="text-xs text-red-500">{errors.assignedToId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Số mẫu mẹ đầu vào <span className="text-red-500">*</span></Label>
              <Input {...register("inputMotherQuantity")} type="number" min={1} placeholder="100" />
              {errors.inputMotherQuantity && <p className="text-xs text-red-500">{errors.inputMotherQuantity.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tuần thực hiện</Label>
              <Input {...register("weekStart")} type="date" />
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 space-y-3">
            <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5" /> Tỉ lệ nhân (tự tính output dự kiến)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tỉ lệ nhân mẫu mẹ</Label>
                <Input {...register("motherSampleRatio")} type="number" step="0.1" min="0" placeholder="3.0" />
                <p className="text-xs text-gray-400">VD: 3.0 = mỗi mẫu tạo ra 3</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tỉ lệ ra rễ</Label>
                <Input {...register("rootingRatio")} type="number" step="0.1" min="0" placeholder="0.8" />
                <p className="text-xs text-gray-400">VD: 0.8 = 80% ra rễ thành TP</p>
              </div>
            </div>
            {(expectedMother || expectedFinished) && (
              <div className="bg-white rounded p-2 text-sm">
                {expectedMother && <p>→ Mẫu mẹ dự kiến: <strong>{expectedMother.toLocaleString("vi-VN")}</strong></p>}
                {expectedFinished && <p>→ Thành phẩm dự kiến: <strong>{expectedFinished.toLocaleString("vi-VN")}</strong></p>}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Input {...register("notes")} placeholder="Ghi chú thêm..." />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tạo chỉ định
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
