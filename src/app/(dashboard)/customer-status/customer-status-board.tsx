"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string; name: string; website: string;
  market: { code: string; name: string };
  status: "CHUA_PHAN_CONG" | "DA_PHAN_CONG";
  firstContactAt: string; lastOrderAt: string | null; lastOrderCode: string | null;
};

export default function CustomerStatusBoard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, { lastOrderAt: string; lastOrderCode: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer-status");
      setCustomers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (c: Customer) => {
    const d = draft[c.id];
    if (!d?.lastOrderAt || !d?.lastOrderCode?.trim()) {
      toast.error("Nhập đủ Ngày ra đơn gần nhất và Mã đơn gần nhất");
      return;
    }
    setSavingId(c.id);
    try {
      const res = await fetch(`/api/customer-status/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastOrderAt: d.lastOrderAt, lastOrderCode: d.lastOrderCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật tình trạng khách hàng");
      load();
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Khách hàng</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Thị trường</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ngày tiếp cận</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ngày ra đơn gần nhất</th>
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã đơn gần nhất</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {customers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-text-muted">Bạn chưa phụ trách khách hàng nào</td></tr>
              ) : (
                customers.map((c) => {
                  const d = draft[c.id] ?? {
                    lastOrderAt: c.lastOrderAt ? format(new Date(c.lastOrderAt), "yyyy-MM-dd") : "",
                    lastOrderCode: c.lastOrderCode ?? "",
                  };
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-text-muted">{c.website}</p>
                      </td>
                      <td className="px-3 py-2">{c.market.code}</td>
                      <td className="px-3 py-2">
                        <Badge variant={c.status === "DA_PHAN_CONG" ? "completed" : "in-progress"}>
                          {c.status === "DA_PHAN_CONG" ? "Đã phân công" : "Chưa phân công"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{format(new Date(c.firstContactAt), "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="date" className="h-8 w-36"
                          value={d.lastOrderAt}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [c.id]: { ...d, lastOrderAt: e.target.value } }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 w-32"
                          value={d.lastOrderCode}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [c.id]: { ...d, lastOrderCode: e.target.value } }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={savingId === c.id} onClick={() => save(c)}>
                          {savingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
