"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SaleUser {
  id: string;
  name: string;
  email: string;
}

export default function RoomAccessDialog({
  roomId,
  roomName,
  saleUsers,
  initialUserIds,
}: {
  roomId: string;
  roomName: string;
  saleUsers: SaleUser[];
  initialUserIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialUserIds));
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const onSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      if (!res.ok) {
        toast.error("Có lỗi xảy ra");
        return;
      }
      toast.success("Đã cập nhật quyền xem");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users className="w-4 h-4 mr-1" /> Phân quyền xem
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Phân quyền xem "{roomName}"</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500 -mt-2">Chọn nhân viên Sale được xem phòng này</p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {saleUsers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Chưa có nhân viên Sale nào</p>
          )}
          {saleUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
              <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
              <span>{u.name}</span>
              <span className="text-xs text-gray-400">({u.email})</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="button" className="flex-1 bg-green-600 hover:bg-green-700" disabled={loading} onClick={onSave}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
