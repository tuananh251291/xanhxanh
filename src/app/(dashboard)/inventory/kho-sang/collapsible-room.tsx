"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";

export default function CollapsibleRoom({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <h2 className="min-w-0 text-lg font-semibold text-gray-800 flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          <Layers className="w-5 h-5 text-yellow-500 shrink-0" /> <span className="break-words">{title}</span>
        </h2>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Thu gọn" : "Xem thêm"}
        </Button>
      </div>
      {expanded && children}
    </div>
  );
}
