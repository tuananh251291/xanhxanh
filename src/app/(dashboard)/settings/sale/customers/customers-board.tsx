"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users } from "lucide-react";
import ExcelImportCard from "@/components/shared/excel-import-card";
import CustomerFormDialog from "./customer-form-dialog";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_STATUS_BADGE_VARIANT, CUSTOMER_GROUP_LABELS, CUSTOMER_GROUP_BADGE_VARIANT } from "@/types";

type Market = { id: string; code: string; name: string };
type UserLite = { id: string; code: string; name: string; role: string };
type CustomerGroup = "KHACH_SI_NHO" | "KHACH_CONG_TY" | "KHACH_CONG_TY_LON";
type Customer = {
  id: string; code: string; name: string; website: string; marketId: string;
  market: { code: string; name: string };
  email: string | null; phone: string | null;
  status: "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH";
  customerGroup: CustomerGroup | null;
  firstContactAt: string; lastOrderAt: string | null; lastOrderCode: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; code: string; name: string } | null;
  manager: { id: string; code: string; name: string } | null;
};

export default function CustomersBoard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketFilter, setMarketFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (marketFilter !== "all") params.set("marketId", marketFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (groupFilter !== "all") params.set("customerGroup", groupFilter);
      if (q.trim()) params.set("q", q.trim());
      const [cRes, mRes, uRes] = await Promise.all([
        fetch(`/api/customers?${params.toString()}`),
        fetch("/api/markets"),
        fetch("/api/users"),
      ]);
      setCustomers(await cRes.json());
      setMarkets(await mRes.json());
      setUsers(await uRes.json());
    } finally {
      setLoading(false);
    }
  }, [marketFilter, statusFilter, groupFilter, q]);

  useEffect(() => { load(); }, [load]);

  const saleUsers = useMemo(() => users.filter((u) => u.role === "SALE"), [users]);

  return (
    <div className="space-y-4">
      <ExcelImportCard
        icon={<Users className="w-4 h-4" />}
        title="Nhập/cập nhật khách hàng bằng Excel"
        description={`Tải file mẫu, điền dữ liệu rồi tải lên — khớp Website đã có trong hệ thống sẽ CẬP NHẬT THAY THẾ, chưa có sẽ TẠO MỚI.`}
        templateUrl="/api/data-import/customers"
        uploadUrl="/api/data-import/customers"
        successLabel={(n) => `Đã nhập/cập nhật ${n} khách hàng`}
      />

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={marketFilter} onValueChange={(v) => setMarketFilter(v ?? "all")}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi thị trường</SelectItem>
                {markets.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi trạng thái</SelectItem>
                <SelectItem value="CHUA_PHAN_CONG">{CUSTOMER_STATUS_LABELS.CHUA_PHAN_CONG}</SelectItem>
                <SelectItem value="DA_PHAN_CONG">{CUSTOMER_STATUS_LABELS.DA_PHAN_CONG}</SelectItem>
                <SelectItem value="MAC_DINH">{CUSTOMER_STATUS_LABELS.MAC_DINH}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v ?? "all")}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi nhóm khách hàng</SelectItem>
                <SelectItem value="KHACH_SI_NHO">{CUSTOMER_GROUP_LABELS.KHACH_SI_NHO}</SelectItem>
                <SelectItem value="KHACH_CONG_TY">{CUSTOMER_GROUP_LABELS.KHACH_CONG_TY}</SelectItem>
                <SelectItem value="KHACH_CONG_TY_LON">{CUSTOMER_GROUP_LABELS.KHACH_CONG_TY_LON}</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Tìm theo tên công ty…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <div className="flex-1" />
            <CustomerFormDialog markets={markets} saleUsers={saleUsers} onSaved={load} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Khách hàng</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Thị trường</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Nhóm khách hàng</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">NV phụ trách</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">NV quản lý</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ngày tiếp cận</th>
                    <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Đơn gần nhất</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {customers.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-6 text-text-muted">Chưa có khách hàng nào</td></tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-text-muted font-mono">{c.code} · {c.website}</p>
                        </td>
                        <td className="px-3 py-2">{c.market.code}</td>
                        <td className="px-3 py-2">
                          <Badge variant={CUSTOMER_STATUS_BADGE_VARIANT[c.status]}>
                            {CUSTOMER_STATUS_LABELS[c.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {c.customerGroup ? (
                            <Badge variant={CUSTOMER_GROUP_BADGE_VARIANT[c.customerGroup]}>
                              {CUSTOMER_GROUP_LABELS[c.customerGroup]}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">{c.assignedTo ? `${c.assignedTo.name} (${c.assignedTo.code})` : "—"}</td>
                        <td className="px-3 py-2">{c.manager ? `${c.manager.name} (${c.manager.code})` : "—"}</td>
                        <td className="px-3 py-2">{format(new Date(c.firstContactAt), "dd/MM/yyyy", { locale: vi })}</td>
                        <td className="px-3 py-2">
                          {c.lastOrderAt ? (
                            <>
                              <p>{format(new Date(c.lastOrderAt), "dd/MM/yyyy", { locale: vi })}</p>
                              <p className="text-xs text-text-muted">{c.lastOrderCode}</p>
                            </>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <CustomerFormDialog markets={markets} saleUsers={saleUsers} customer={c} onSaved={load} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
