"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/types";
import type { UserRole } from "@prisma/client";

type PendingUser = { id: string; code: string; name: string; email: string };

export default function PendingApprovals({ users }: { users: PendingUser[] }) {
  const router = useRouter();
  const [roleMap, setRoleMap] = useState<Record<string, UserRole>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const approve = async (id: string) => {
    const role = roleMap[id];
    if (!role) { toast.error("Chọn vai trò trước khi duyệt"); return; }
    setProcessing(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED", role }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã duyệt tài khoản");
      router.refresh();
    } finally { setProcessing(null); }
  };

  const reject = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
      toast.success("Đã từ chối tài khoản");
      router.refresh();
    } finally { setProcessing(null); }
  };

  if (users.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-yellow-500">
      <CardHeader>
        <CardTitle className="text-base">Tài khoản chờ duyệt ({users.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 border rounded-lg p-3">
            <div className="flex-1">
              <p className="font-medium text-sm">{u.name}</p>
              <p className="text-xs text-gray-500">{u.email} · {u.code}</p>
            </div>
            <Select onValueChange={(v) => setRoleMap((prev) => ({ ...prev, [u.id]: v as UserRole }))}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              disabled={processing === u.id}
              onClick={() => approve(u.id)}
            >
              {processing === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              disabled={processing === u.id}
              onClick={() => reject(u.id)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
