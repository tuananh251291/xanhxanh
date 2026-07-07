"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Material = { id: string; code: string; name: string; unit: string | null; quantity: number };

export default function MaterialIntakeDialog({ materials }: { materials: Material[] }) {
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const quantityNum = parseInt(quantity, 10) || 0;
  const isValid = !!materialId && quantityNum > 0;

  const reset = () => { setMaterialId(""); setQuantity(""); setNotes(""); };

  const submit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const res = await fetch("/api/material-intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId, quantity: quantityNum, notes: notes || undefined }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã nhập vật tư — cập nhật tồn kho");
      setOpen(false); reset(); router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button className="bg-primary hover:bg-primary-hover" />}>
        <PackagePlus className="w-4 h-4 mr-2" /> Nhập vật tư
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nhập vật tư về kho</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>Vật tư</Label>
            <Select
              items={materials.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}${m.unit ? ` (${m.unit})` : ""}` }))}
              value={materialId || null}
              onValueChange={(v) => setMaterialId(v as string)}
            >
              <SelectTrigger><SelectValue placeholder="Chọn vật tư" /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}{m.unit ? ` (${m.unit})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Số lượng nhập</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label>Ghi chú (tuỳ chọn)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nguồn nhập, ghi chú..." />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={!isValid || loading} onClick={submit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Nhập vật tư
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
