"use client";

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { ChevronDown, type LucideIcon } from "lucide-react";

// Thu gọn từng mục thống kê trực quan thành 1 dòng tiêu đề — bấm vào mới hiện biểu đồ/bảng bên trong,
// bấm lại (hoặc bấm mũi tên) để thu lại. Mặc định thu gọn hết (defaultOpen=false) để trang không quá dài
// khi mới vào — component chỉ bọc NGOÀI section gốc (RatioTrendSection, ...), không sửa gì bên trong
// từng section.
export default function CollapsibleSection({
  title, icon: Icon, defaultOpen = false, children,
}: {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card className="p-0 overflow-hidden">
        <CollapsibleTrigger className="group w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary-light/40 transition-colors">
          <span className="flex items-center gap-2 font-bold text-base text-primary-strong">
            <Icon className="w-4 h-4 shrink-0" /> {title}
          </span>
          <ChevronDown className="w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 pt-0 space-y-4">{children}</div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
