"use client";

import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import CreateInstructionDialog from "../create-instruction-dialog";

type Instruction = {
  id: string;
  code: string;
  plantType: { code: string; name: string };
  assignedTo: { name: string } | null;
  items: { quantity: number }[];
};

// slotCount luôn >= minCount — mỗi ô trống (i <= minCount, chưa có chỉ định thứ i) hiện nút "Tạo chỉ
// định cấy dự phòng {i}"; ô đã có chỉ định hiện thẳng thông tin chỉ định đó (link sang trang chi tiết).
// Đã tạo vượt minCount thì các chỉ định dư vẫn hiện tiếp theo thứ tự, không có ô trống xen giữa.
export default function BackupInstructionSlots({ instructions, minCount }: { instructions: Instruction[]; minCount: number }) {
  const slotCount = Math.max(minCount, instructions.length);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {Array.from({ length: slotCount }, (_, idx) => {
          const i = idx + 1;
          const inst = instructions[idx];

          if (inst) {
            const qty = inst.items.reduce((s, it) => s + it.quantity, 0);
            return (
              <Link key={inst.id} href={`/instructions/${inst.id}`} className="block">
                <div className="flex items-center gap-2 border border-primary-light bg-primary-light/50 rounded-lg px-3 py-2.5 hover:bg-primary-light transition-colors h-full">
                  <CheckCircle2 className="w-4 h-4 text-primary-strong shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary-strong truncate">{inst.code}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {inst.plantType.code} · {qty.toLocaleString("vi-VN")} cụm · {inst.assignedTo ? inst.assignedTo.name : "Chưa gắn NV"}
                    </p>
                  </div>
                </div>
              </Link>
            );
          }

          return (
            <CreateInstructionDialog
              key={`slot-${i}`}
              backupMode
              slotNumber={i}
              triggerContent={`Tạo chỉ định cấy dự phòng ${i}`}
              triggerClassName="w-full h-auto py-2.5 justify-start bg-card border border-dashed border-border text-text-secondary hover:border-primary hover:text-primary-strong hover:bg-primary-light/30"
            />
          );
        })}
      </div>

      <CreateInstructionDialog
        backupMode
        slotNumber={slotCount + 1}
        triggerContent={
          <>
            <Plus className="w-4 h-4 mr-1.5" /> Thêm chỉ định dự phòng
          </>
        }
        triggerClassName="bg-primary hover:bg-primary-hover"
      />
    </div>
  );
}
