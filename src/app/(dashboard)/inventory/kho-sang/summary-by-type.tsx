"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search } from "lucide-react";

type TypeSummary = { name: string; mother: number; finished: number };

export default function SummaryByType({ entries }: { entries: TypeSummary[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Tổng hợp theo loại cây</CardTitle>
          <Button
            type="button"
            size="sm"
            className={expanded ? "h-8" : "h-8 bg-primary hover:bg-primary-hover"}
            variant={expanded ? "outline" : "default"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5 mr-1.5" /> : <Search className="w-3.5 h-3.5 mr-1.5" />}
            {expanded ? "Thu gọn" : "Xem chi tiết"}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-text-muted text-sm">Kho trống</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {entries.map((e) => (
                <div key={e.name} className="flex items-center justify-between bg-background rounded px-3 py-2">
                  <span className="font-medium text-sm">{e.name}</span>
                  <div className="flex gap-2 text-xs">
                    {e.mother > 0 && <Badge className="bg-violet-light text-violet-foreground">MM: {e.mother.toLocaleString("vi-VN")}</Badge>}
                    {e.finished > 0 && <Badge className="bg-primary-light text-primary-strong">TP: {e.finished.toLocaleString("vi-VN")}</Badge>}
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
