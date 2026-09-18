"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Evaluation = {
  id: string;
  code: string;
  weekStart: string;
  warehouse: { name: string };
  room: { name: string };
  rotationGroup: { name: string };
  assignedTo: { name: string; code: string };
};

export default function RootingQualityEvaluationBoard({ evaluations }: { evaluations: Evaluation[] }) {
  if (evaluations.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có Nhóm tuần ra rễ nào đến hạn cần đánh giá</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {evaluations.map((e) => (
        <Card key={e.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium text-foreground">
                {e.rotationGroup.name} <span className="text-text-muted font-normal">— {e.room.name} ({e.warehouse.name})</span>
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                <span className="font-mono">{e.code}</span> · Tuần {format(new Date(e.weekStart), "dd/MM/yyyy", { locale: vi })} · Phụ trách: {e.assignedTo.name}
              </p>
            </div>
            <Link href={`/rooting-quality-evaluation/${e.id}`}>
              <Button size="sm" className="bg-primary hover:bg-primary-hover">
                <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" /> Đánh giá
              </Button>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
