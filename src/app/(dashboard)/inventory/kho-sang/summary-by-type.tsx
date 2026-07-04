"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

type TypeSummary = { name: string; mother: number; finished: number };

export default function SummaryByType({ entries }: { entries: TypeSummary[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Tổng hợp theo loại cây</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
            {expanded ? "Thu gọn" : "Xem chi tiết"}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-gray-400 text-sm">Kho trống</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {entries.map((e) => (
                <div key={e.name} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                  <span className="font-medium text-sm">{e.name}</span>
                  <div className="flex gap-2 text-xs">
                    {e.mother > 0 && <Badge className="bg-purple-100 text-purple-700">MM: {e.mother.toLocaleString("vi-VN")}</Badge>}
                    {e.finished > 0 && <Badge className="bg-green-100 text-green-700">TP: {e.finished.toLocaleString("vi-VN")}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
