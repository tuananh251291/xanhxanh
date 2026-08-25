"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_STATUS_BADGE_VARIANT } from "@/types";

type Customer = {
  id: string; name: string; website: string;
  market: { code: string; name: string };
  status: "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH";
  firstContactAt: string; lastOrderAt: string | null; lastOrderCode: string | null;
};

const PAGE_SIZE = 10;

export default function CustomerStatusBoard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, { lastOrderAt: string; lastOrderCode: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

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
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder="Tìm theo tên khách hàng..."
          list="customer-name-suggestions"
          className="pl-9"
        />
        <datalist id="customer-name-suggestions">
          {customers.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </div>

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
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-text-muted">Không tìm thấy khách hàng nào khớp</td></tr>
              ) : (
                paginated.map((c) => {
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
                        <Badge variant={CUSTOMER_STATUS_BADGE_VARIANT[c.status]}>
                          {CUSTOMER_STATUS_LABELS[c.status]}
                        </Badge>
                        {c.status === "MAC_DINH" && (
                          <p className="text-xs text-text-muted mt-0.5">Không cần cập nhật hàng tháng</p>
                        )}
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

      {filtered.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-text-secondary">Trang {currentPage}/{totalPages} — {filtered.length} khách hàng</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Sau <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
