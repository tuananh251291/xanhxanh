"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Loader2 } from "lucide-react";

type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  assignedDate: string;
};

export default function TodayChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/today");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (item: ChecklistItem) => {
    setSavingId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: !i.completed } : i)));
    try {
      const res = await fetch(`/api/checklist/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !item.completed }),
      });
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: item.completed } : i)));
      }
    } finally {
      setSavingId(null);
    }
  };

  if (loading || items.length === 0) return null;

  const doneCount = items.filter((i) => i.completed).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-cyan-600" /> Việc cần làm hôm nay
          </CardTitle>
          <Badge variant="secondary">{doneCount}/{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
            <Checkbox
              checked={item.completed}
              disabled={savingId === item.id}
              onCheckedChange={() => toggle(item)}
            />
            <span className={item.completed ? "line-through text-gray-400" : "text-gray-700"}>{item.title}</span>
            {savingId === item.id && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
