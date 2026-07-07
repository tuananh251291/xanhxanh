"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Leaf } from "lucide-react";
import PlantTypeDialog from "./plant-type-dialog";

type Category = { id: string; code: string; name: string };
type PlantType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  transferWaitWeeks: number;
  rootingWeeks: number;
  isActive: boolean;
  category: Category;
};

export default function PlantTypeTable({ plantTypes, categories }: { plantTypes: PlantType[]; categories: Category[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plantTypes;
    return plantTypes.filter((p) =>
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.code.toLowerCase().includes(q) ||
      p.category.name.toLowerCase().includes(q)
    );
  }, [plantTypes, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã, tên, loại cây..."
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã cây</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên chi tiết</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Loại cây</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thời gian đợi cấy chuyển</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thời gian ra rễ</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-sm text-text-muted py-10">Không tìm thấy chi tiết loại cây nào khớp</td></tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-primary-strong">{p.code}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        <span className="flex items-center gap-2"><Leaf className="w-3.5 h-3.5 text-primary-strong shrink-0" />{p.name}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        <span className="font-mono text-xs text-text-secondary mr-1">{p.category.code}</span>{p.category.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{p.transferWaitWeeks} tuần</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{p.rootingWeeks} tuần</td>
                      <td className="px-4 py-3">
                        <Badge className={p.isActive ? "bg-primary-light text-primary-strong" : "bg-muted text-text-secondary"}>
                          {p.isActive ? "Hoạt động" : "Vô hiệu"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <PlantTypeDialog categories={categories} plant={{ ...p, description: p.description ?? undefined }} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
