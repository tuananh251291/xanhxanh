"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Notification = { id: string; title: string; message: string; createdAt: string };

export default function SupplierNotifications({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  if (notifications.length === 0) return null;

  const markRead = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-portal/notifications", { method: "PATCH" });
      if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="w-4 h-4" /> Thông báo mới ({notifications.length})
        </CardTitle>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={markRead}>
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Đã đọc tất cả
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {notifications.map((n) => (
          <div key={n.id} className="rounded-lg bg-info-light px-3 py-2">
            <p className="text-sm font-semibold text-info-foreground">{n.title}</p>
            <p className="text-sm text-foreground">{n.message}</p>
            <p className="text-xs text-text-secondary mt-0.5">{new Date(n.createdAt).toLocaleString("vi-VN")}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
