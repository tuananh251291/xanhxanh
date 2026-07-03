"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
}

export default function AddMarketRoomDialog({ warehouseId, warehouseCode }: { warehouseId: string; warehouseCode: string }) {
  const [open, setOpen] = useState(false);
  const [marketName, setMarketName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit = async () => {
    if (!marketName.trim()) return;
    setLoading(true);
    try {
      const code = `${warehouseCode}-TT-${slugify(marketName)}`;
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: `Phòng thị trường ${marketName.trim()}`,
          type: "PHONG_THI_TRUONG",
          warehouseId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã mở phòng thị trường mới");
      setOpen(false);
      setMarketName("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1" /> Thêm phòng thị trường
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mở phòng thị trường mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Tên thị trường</Label>
          <Input
            value={marketName}
            onChange={(e) => setMarketName(e.target.value)}
            placeholder="Vd: Nhật Bản"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="button" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading} onClick={onSubmit}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Tạo phòng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
