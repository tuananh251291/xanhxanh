"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { ROLE_NAV, ROLE_LABELS, isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";

type Permission = { role: UserRole; href: string; enabled: boolean };

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export default function PermissionMatrix({ permissions }: { permissions: Permission[] }) {
  // Danh mục trang: gộp từ ROLE_NAV, bỏ /dashboard (luôn được phép, không cho tắt)
  const pages = useMemo(() => {
    const seen = new Map<string, string>();
    for (const items of Object.values(ROLE_NAV)) {
      for (const item of items) {
        if (item.href === "/dashboard") continue;
        if (!seen.has(item.href)) seen.set(item.href, item.label);
      }
    }
    return Array.from(seen.entries()).map(([href, label]) => ({ href, label }));
  }, []);

  const initialState = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissions) map.set(`${p.role}|${p.href}`, p.enabled);
    return map;
  }, [permissions]);

  const [state, setState] = useState(initialState);
  const [dirty, setDirty] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);

  const isEnabled = (role: UserRole, href: string) => {
    if (isAdminRole(role)) return true;
    const key = `${role}|${href}`;
    return state.get(key) ?? true;
  };

  const toggle = (role: UserRole, href: string) => {
    if (isAdminRole(role)) return;
    const key = `${role}|${href}`;
    const next = !isEnabled(role, href);
    setState((prev) => new Map(prev).set(key, next));
    setDirty((prev) => new Map(prev).set(key, next));
  };

  const save = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const changes = Array.from(dirty.entries()).map(([key, enabled]) => {
        const [role, href] = key.split("|");
        return { role: role as UserRole, href, enabled };
      });
      const res = await fetch("/api/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
      toast.success("Đã lưu phân quyền");
      setDirty(new Map());
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Phân quyền truy cập trang theo vai trò</CardTitle>
        <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={saving || dirty.size === 0} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Lưu thay đổi{dirty.size > 0 ? ` (${dirty.size})` : ""}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-green-700">
                <th className="text-left px-3 py-2 font-medium text-white sticky left-0 bg-green-700">Trang</th>
                {ROLES.map((role) => (
                  <th key={role} className="text-center px-2 py-2 font-medium text-white whitespace-nowrap">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.href} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                  <td className="px-3 py-2 font-medium text-gray-800 sticky left-0 bg-green-50 whitespace-nowrap">
                    {page.label}
                    <span className="text-xs text-gray-400 block">{page.href}</span>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="text-center px-2 py-2">
                      <Checkbox
                        checked={isEnabled(role, page.href)}
                        disabled={isAdminRole(role)}
                        onCheckedChange={() => toggle(role, page.href)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
