"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, ChevronDown, ChevronUp } from "lucide-react";
import { format, addDays } from "date-fns";
import { vi } from "date-fns/locale";
import { INSTRUCTION_STATUS_LABELS } from "@/types";
import type { InstructionStatus } from "@prisma/client";

const STATUS_COLORS: Record<InstructionStatus, string> = {
  DRAFT: "bg-muted text-text-secondary",
  ACTIVE: "bg-info-light text-info-foreground",
  COMPLETED: "bg-primary-light text-primary-strong",
  CANCELLED: "bg-danger-light text-destructive",
  ENDED: "bg-muted text-foreground",
};

const COLLAPSED_COUNT = 5;

type DoneInstruction = {
  id: string;
  code: string;
  status: InstructionStatus;
  weekStart: Date | string | null;
  plantType: { code: string; name: string };
};

export default function DoneInstructionsTable({ instructions }: { instructions: DoneInstruction[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? instructions : instructions.slice(0, COLLAPSED_COUNT);
  const hiddenCount = instructions.length - COLLAPSED_COUNT;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã chỉ định</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây / Tên cây</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Thời gian cấy</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                <th className="px-4 py-3 font-bold text-base">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inst) => (
                <tr key={inst.id} className="border-b last:border-0 even:bg-primary-light/30">
                  <td className="px-4 py-3 font-mono text-text-secondary">{inst.code}</td>
                  <td className="px-4 py-3 text-foreground">
                    <span className="font-mono">{inst.plantType.code}</span> — {inst.plantType.name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                    {inst.weekStart ? (
                      <>Từ <strong>{format(new Date(inst.weekStart), "dd/MM/yyyy", { locale: vi })}</strong> đến <strong>{format(addDays(new Date(inst.weekStart), 6), "dd/MM/yyyy", { locale: vi })}</strong></>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_COLORS[inst.status]}>{INSTRUCTION_STATUS_LABELS[inst.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/instructions/${inst.id}`}>
                      <Button size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hiddenCount > 0 && (
          <div className="flex justify-center py-3 border-t border-divider">
            <Button size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (
                <>Thu gọn <ChevronUp className="w-4 h-4 ml-1" /></>
              ) : (
                <>Xem thêm ({hiddenCount}) <ChevronDown className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
