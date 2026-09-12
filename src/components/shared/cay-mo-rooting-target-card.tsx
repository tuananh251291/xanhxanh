import { Card, CardContent } from "@/components/ui/card";
import { Sprout } from "lucide-react";
import type { CayMoRootingTarget } from "@/lib/rooting-target";

const num = (n: number) => n.toLocaleString("vi-VN");

// Dùng chung cho cả dashboard nâng cao (/dashboard) và cơ bản (/dashboard-basic) — không có "use client"
// nên tự tương thích cả server component lẫn client component gọi tới.
export default function CayMoRootingTargetCard({ target }: { target: CayMoRootingTarget }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-2">
          <Sprout className="w-4 h-4 text-primary-strong" />
          <p className="text-sm font-bold text-primary-strong">Chỉ tiêu cây ra rễ tháng này</p>
        </div>
        <div className="space-y-1.5 text-sm text-text-secondary">
          <p>
            Bạn cần cấy tối thiểu <span className="font-bold text-foreground">{num(target.minRequiredPerRemainingDay)}</span> cây để hoàn thành chỉ tiêu của tháng.
          </p>
          <p>
            Hôm nay bạn đã cấy được <span className="font-bold text-foreground">{num(target.todayQuantity)}</span> cây ra rễ.
          </p>
          {target.deficitQuantity > 0 ? (
            <p>
              Từ đầu tháng đến hiện tại còn thiếu <span className="font-bold text-destructive">{num(target.deficitQuantity)}</span> cây để đạt chỉ tiêu.
            </p>
          ) : target.deficitQuantity < 0 ? (
            <p>
              Từ đầu tháng đến hiện tại bạn đã vượt <span className="font-bold text-success-foreground">{num(-target.deficitQuantity)}</span> cây so với chỉ tiêu.
            </p>
          ) : (
            <p>Bạn đã đạt đúng chỉ tiêu luỹ kế từ đầu tháng đến hiện tại.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
