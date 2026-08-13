"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

type Market = { id: string; code: string; name: string; isActive: boolean };
type User = { id: string; code: string; name: string; role: string };
type Assignment = { id: string; marketId: string; salesUser: { id: string; code: string; name: string }; manager: { id: string; code: string; name: string } };
type Option = { value: string; label: string };

type Row = {
  key: string;
  id: string | null;
  managerId: string | null;
  salesUserId: string | null;
  marketId: string | null;
  savedSalesUserId: string | null;
  savedMarketId: string | null;
};

function emptyRow(): Row {
  return {
    key: crypto.randomUUID(),
    id: null,
    managerId: null,
    salesUserId: null,
    marketId: null,
    savedSalesUserId: null,
    savedMarketId: null,
  };
}

export default function ManagersBoard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, uRes, aRes] = await Promise.all([
        fetch("/api/markets"),
        fetch("/api/users"),
        fetch("/api/sales-manager-assignments"),
      ]);
      const marketsData: Market[] = await mRes.json();
      const usersData: User[] = await uRes.json();
      const assignmentsData: Assignment[] = await aRes.json();
      setMarkets(marketsData);
      setUsers(usersData);
      setRows(
        assignmentsData.map((a) => ({
          key: a.id,
          id: a.id,
          managerId: a.manager.id,
          salesUserId: a.salesUser.id,
          marketId: a.marketId,
          savedSalesUserId: a.salesUser.id,
          savedMarketId: a.marketId,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saleUsers = useMemo(() => users.filter((u) => u.role === "SALE"), [users]);
  const saleUserOptions: Option[] = useMemo(
    () => saleUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` })),
    [saleUsers]
  );
  const marketOptions: Option[] = useMemo(
    () => markets.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [markets]
  );

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const save = async (row: Row) => {
    if (!row.managerId || !row.salesUserId || !row.marketId) {
      toast.error("Chọn đủ Nhân viên quản lý, Nhân viên bán hàng và Thị trường");
      return;
    }
    if (row.managerId === row.salesUserId) {
      toast.error("Nhân viên bán hàng và Nhân viên quản lý không được trùng nhau");
      return;
    }
    setSavingKey(row.key);
    try {
      const res = await fetch("/api/sales-manager-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesUserId: row.salesUserId, managerId: row.managerId, marketId: row.marketId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      // Sửa 1 dòng đã lưu mà đổi NV bán hàng/thị trường (đổi khoá) — POST upsert chỉ tạo/cập nhật theo
      // khoá MỚI, phải tự xoá dòng cũ theo khoá cũ để tránh trùng 2 dòng cho cùng 1 lần sửa.
      if (row.id && (row.savedSalesUserId !== row.salesUserId || row.savedMarketId !== row.marketId)) {
        await fetch(`/api/sales-manager-assignments/${row.id}`, { method: "DELETE" });
      }
      toast.success("Đã lưu phân công quản lý");
      load();
    } finally {
      setSavingKey(null);
    }
  };

  const removeRow = async (row: Row) => {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    setRemovingKey(row.key);
    try {
      await fetch(`/api/sales-manager-assignments/${row.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.key !== row.key));
    } finally {
      setRemovingKey(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        {saleUsers.length === 0 ? (
          <p className="text-sm text-text-muted py-4">Chưa có nhân viên bán hàng nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Nhân viên quản lý</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Nhân viên bán hàng</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Thị trường</th>
                  <th className="px-3 py-2 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-text-muted">Chưa có phân công nào — bấm &quot;Thêm dòng&quot; để tạo mới</td></tr>
                ) : (
                  rows.map((row) => {
                    return (
                      <tr key={row.key}>
                        <td className="px-3 py-2 min-w-56">
                          <Combobox
                            items={saleUserOptions}
                            value={saleUserOptions.find((o) => o.value === row.managerId) ?? null}
                            isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
                            onValueChange={(v) => updateRow(row.key, { managerId: (v as Option | null)?.value ?? null })}
                          >
                            <ComboboxInputGroup className="h-9">
                              <ComboboxInput className="text-sm" placeholder="Gõ tên hoặc mã NV…" />
                              <ComboboxTrigger />
                            </ComboboxInputGroup>
                            <ComboboxContent>
                              <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                              <ComboboxList>
                                {(item: Option) => <ComboboxItem key={item.value} value={item} className="text-sm">{item.label}</ComboboxItem>}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </td>
                        <td className="px-3 py-2 min-w-56">
                          <Combobox
                            items={saleUserOptions}
                            value={saleUserOptions.find((o) => o.value === row.salesUserId) ?? null}
                            isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
                            onValueChange={(v) => updateRow(row.key, { salesUserId: (v as Option | null)?.value ?? null })}
                          >
                            <ComboboxInputGroup className="h-9">
                              <ComboboxInput className="text-sm" placeholder="Gõ tên hoặc mã NV…" />
                              <ComboboxTrigger />
                            </ComboboxInputGroup>
                            <ComboboxContent>
                              <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                              <ComboboxList>
                                {(item: Option) => <ComboboxItem key={item.value} value={item} className="text-sm">{item.label}</ComboboxItem>}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </td>
                        <td className="px-3 py-2 min-w-56">
                          <Combobox
                            items={marketOptions}
                            value={marketOptions.find((o) => o.value === row.marketId) ?? null}
                            isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
                            onValueChange={(v) => updateRow(row.key, { marketId: (v as Option | null)?.value ?? null })}
                          >
                            <ComboboxInputGroup className="h-9">
                              <ComboboxInput className="text-sm" placeholder="Gõ tên hoặc mã thị trường…" />
                              <ComboboxTrigger />
                            </ComboboxInputGroup>
                            <ComboboxContent>
                              <ComboboxEmpty>Không tìm thấy thị trường</ComboboxEmpty>
                              <ComboboxList>
                                {(item: Option) => <ComboboxItem key={item.value} value={item} className="text-sm">{item.label}</ComboboxItem>}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                        </td>
                        <td className="px-3 py-2 flex items-center gap-1">
                          <Button
                            size="sm"
                            className="bg-primary hover:bg-primary-hover"
                            disabled={savingKey === row.key || !row.managerId || !row.salesUserId || !row.marketId}
                            onClick={() => save(row)}
                          >
                            {savingKey === row.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={removingKey === row.key} onClick={() => removeRow(row)}>
                            {removingKey === row.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 text-destructive" />}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
          <Plus className="w-4 h-4" /> Thêm dòng
        </Button>
      </CardContent>
    </Card>
  );
}
