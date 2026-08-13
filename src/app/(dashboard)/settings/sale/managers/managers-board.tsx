"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

type Market = { id: string; code: string; name: string; isActive: boolean };
type User = { id: string; code: string; name: string; role: string };
type Assignment = { id: string; marketId: string; salesUser: { id: string; code: string; name: string }; manager: { id: string; code: string; name: string } };

export default function ManagersBoard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [marketId, setMarketId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, uRes] = await Promise.all([fetch("/api/markets"), fetch("/api/users")]);
      const marketsData: Market[] = await mRes.json();
      setMarkets(marketsData);
      setUsers(await uRes.json());
      setMarketId((prev) => prev || marketsData[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadAssignments = useCallback(async (mId: string) => {
    if (!mId) return;
    const res = await fetch(`/api/sales-manager-assignments?marketId=${mId}`);
    setAssignments(await res.json());
  }, []);

  useEffect(() => { if (marketId) loadAssignments(marketId); }, [marketId, loadAssignments]);

  const saleUsers = useMemo(() => users.filter((u) => u.role === "SALE"), [users]);
  const assignmentBySales = useMemo(() => new Map(assignments.map((a) => [a.salesUser.id, a])), [assignments]);

  const save = async (salesUserId: string) => {
    const managerId = draft[salesUserId];
    if (!managerId) return;
    setSavingId(salesUserId);
    try {
      const res = await fetch("/api/sales-manager-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesUserId, managerId, marketId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu phân công quản lý");
      loadAssignments(marketId);
    } finally {
      setSavingId(null);
    }
  };

  const unassign = async (assignmentId: string) => {
    await fetch(`/api/sales-manager-assignments/${assignmentId}`, { method: "DELETE" });
    loadAssignments(marketId);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-1 max-w-xs">
          <Label>Thị trường</Label>
          <Select value={marketId} onValueChange={(v) => setMarketId(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Chọn thị trường" /></SelectTrigger>
            <SelectContent>
              {markets.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {markets.length === 0 ? (
          <p className="text-sm text-text-muted py-4">Chưa có thị trường nào — tạo thị trường ở tab &quot;Thị trường&quot; trước.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">NV bán hàng</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">NV quản lý ở thị trường này</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {saleUsers.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-6 text-text-muted">Chưa có NV bán hàng nào</td></tr>
                ) : (
                  saleUsers.map((u) => {
                    const current = assignmentBySales.get(u.id);
                    const value = draft[u.id] ?? current?.manager.id ?? "";
                    return (
                      <tr key={u.id}>
                        <td className="px-3 py-2">{u.name} <span className="text-text-muted font-mono text-xs">({u.code})</span></td>
                        <td className="px-3 py-2">
                          <Select value={value} onValueChange={(v) => setDraft((prev) => ({ ...prev, [u.id]: v as string }))}>
                            <SelectTrigger className="w-64"><SelectValue placeholder="Chưa gán" /></SelectTrigger>
                            <SelectContent>
                              {users.filter((m) => m.id !== u.id).map((m) => (
                                <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 flex items-center gap-1">
                          <Button
                            size="sm"
                            className="bg-primary hover:bg-primary-hover"
                            disabled={savingId === u.id || !value || value === current?.manager.id}
                            onClick={() => save(u.id)}
                          >
                            {savingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </Button>
                          {current && (
                            <Button size="sm" variant="ghost" onClick={() => unassign(current.id)}>
                              <X className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
