"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Leaf } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PlantCategoryDialog from "./plant-category-dialog";
import PlantTypeDialog from "./plant-type-dialog";

type PlantType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  transferWaitWeeks: number;
  rootingWeeks: number;
  isActive: boolean;
};

type Category = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  plantTypes: PlantType[];
};

export default function PlantCategoryList({ categories }: { categories: Category[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(categories.map((c) => c.id)));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {categories.map((cat) => (
        <Card key={cat.id}>
          <CardContent className="p-0">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggle(cat.id)}
            >
              <div className="flex items-center gap-2">
                {expanded.has(cat.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <span className="font-mono font-bold text-green-700">{cat.code}</span>
                <span className="font-medium text-gray-900">{cat.name}</span>
                <Badge variant="secondary">{cat.plantTypes.length} chi tiết</Badge>
                <Badge className={cat.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                  {cat.isActive ? "Hoạt động" : "Vô hiệu"}
                </Badge>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <PlantTypeDialog categoryId={cat.id} categoryCode={cat.code} />
                <PlantCategoryDialog category={cat} />
              </div>
            </div>

            {expanded.has(cat.id) && (
              <div className="border-t overflow-x-auto">
                {cat.plantTypes.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Chưa có chi tiết loại cây nào trong nhóm này</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Mã cây</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Tên chi tiết</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Thời gian đợi cấy chuyển</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Thời gian ra rễ</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Trạng thái</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.plantTypes.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm font-mono font-medium text-green-700">{p.code}</td>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900 flex items-center gap-2">
                            <Leaf className="w-3.5 h-3.5 text-green-500" />{p.name}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">{p.transferWaitWeeks} tuần</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{p.rootingWeeks} tuần</td>
                          <td className="px-4 py-2">
                            <Badge className={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                              {p.isActive ? "Hoạt động" : "Vô hiệu"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 flex items-center gap-1">
                            <PlantTypeDialog
                              categoryId={cat.id}
                              categoryCode={cat.code}
                              plant={{ ...p, description: p.description ?? undefined }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
