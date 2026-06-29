"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PenLine, Loader2, Plus, Trash2, Calculator } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Instruction = {
  id: string;
  code: string;
  plantType: { name: string };
  mediumType?: { name: string } | null;
  inputMotherQuantity: number;
  expectedMotherOutput?: number | null;
  status: string;
};

const schema = z.object({
  instructionId: z.string().min(1, "Chọn chỉ định cấy"),
  recordDate: z.string(),
  motherUsed: z.coerce.number().int().positive("Số mẫu mẹ dùng > 0"),
  notes: z.string().optional(),
  items: z.array(z.object({
    stage: z.enum(["MAU_ME", "THANH_PHAM"]),
    quantityCreated: z.coerce.number().int().positive("Số lượng > 0"),
  })).min(1, "Nhập ít nhất 1 dòng sản lượng"),
});

type FormData = z.infer<typeof schema>;

export default function DailyRecordPage() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { register, handleSubmit, control, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: {
      recordDate: format(new Date(), "yyyy-MM-dd"),
      items: [{ stage: "MAU_ME", quantityCreated: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    fetch("/api/instructions?status=ACTIVE")
      .then((r) => r.json())
      .then((data) => setInstructions(Array.isArray(data) ? data : []));
  }, []);

  const selectedId = watch("instructionId");
  const selectedInst = instructions.find((i) => i.id === selectedId);
  const items = watch("items");
  const totalMother = items.filter((i) => i.stage === "MAU_ME").reduce((s, i) => s + (Number(i.quantityCreated) || 0), 0);
  const totalFinished = items.filter((i) => i.stage === "THANH_PHAM").reduce((s, i) => s + (Number(i.quantityCreated) || 0), 0);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Lưu nhật ký cấy thành công!");
      if (json.alert) toast.warning("⚠️ Sản lượng lệch >20% so với kỳ vọng — đã gửi cảnh báo cho KY_THUAT");
      reset({ recordDate: format(new Date(), "yyyy-MM-dd"), items: [{ stage: "MAU_ME", quantityCreated: 0 }] });
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PenLine className="w-6 h-6 text-green-600" /> Nhập dữ liệu cấy
        </h1>
        <p className="text-gray-500 text-sm mt-1">Ghi nhận sản lượng hàng ngày</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin chung</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Chỉ định cấy <span className="text-red-500">*</span></Label>
              <Select onValueChange={(v) => setValue("instructionId", v as string)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chỉ định cấy đang thực hiện" />
                </SelectTrigger>
                <SelectContent>
                  {instructions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.code} — {inst.plantType.name}
                      {inst.mediumType ? ` (${inst.mediumType.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.instructionId && <p className="text-xs text-red-500">{errors.instructionId.message}</p>}

              {selectedInst && (
                <div className="bg-blue-50 rounded p-2 mt-1 text-xs text-blue-700 space-y-0.5">
                  <p>Đầu vào: {selectedInst.inputMotherQuantity.toLocaleString("vi-VN")} mẫu mẹ</p>
                  {selectedInst.expectedMotherOutput && (
                    <p>Dự kiến mẫu mẹ: {selectedInst.expectedMotherOutput.toLocaleString("vi-VN")}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Ngày ghi nhận</Label>
                <Input {...register("recordDate")} type="date" />
              </div>
              <div className="space-y-1">
                <Label>Số mẫu mẹ đã dùng <span className="text-red-500">*</span></Label>
                <Input {...register("motherUsed")} type="number" min={1} placeholder="0" />
                {errors.motherUsed && <p className="text-xs text-red-500">{errors.motherUsed.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Ghi chú</Label>
              <Input {...register("notes")} placeholder="Ghi chú thêm..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Sản lượng tạo ra
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ stage: "MAU_ME", quantityCreated: 0 })}>
                <Plus className="w-4 h-4 mr-1" /> Thêm dòng
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="flex items-center gap-2">
                <Select
                  defaultValue={field.stage}
                  onValueChange={(v) => setValue(`items.${idx}.stage`, v as "MAU_ME" | "THANH_PHAM")}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAU_ME">Mẫu mẹ (MM)</SelectItem>
                    <SelectItem value="THANH_PHAM">Thành phẩm (TP)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  {...register(`items.${idx}.quantityCreated`)}
                  type="number"
                  min={1}
                  placeholder="Số lượng"
                  className="flex-1"
                />
                {fields.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                )}
              </div>
            ))}

            {errors.items && <p className="text-xs text-red-500">{errors.items.message ?? errors.items.root?.message}</p>}

            {(totalMother > 0 || totalFinished > 0) && (
              <div className="bg-green-50 rounded p-2 text-sm mt-1">
                {totalMother > 0 && <p>Mẫu mẹ hôm nay: <strong>{totalMother.toLocaleString("vi-VN")}</strong></p>}
                {totalFinished > 0 && <p>Thành phẩm hôm nay: <strong>{totalFinished.toLocaleString("vi-VN")}</strong></p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Lưu nhật ký
        </Button>
      </form>
    </div>
  );
}
