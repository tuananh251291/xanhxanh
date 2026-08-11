import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { isPageAllowed } from "@/lib/permissions";
import { getWeekBuckets } from "@/lib/report-utils";
import { TrendingUp, Sprout, Flower2, ShieldAlert, AlertTriangle, Trophy, ClipboardList, Moon, Package } from "lucide-react";
import RatioTrendSection from "./ratio-trend-section";
import StaffRankingSection from "./staff-ranking-section";
import ContaminationBreakdownSection from "./contamination-breakdown-section";
import InstructionProgressSection from "./instruction-progress-section";
import SurplusMotherReturnedSection from "./surplus-mother-returned-section";
import DarkRoomContaminationByInstructionSection from "./dark-room-contamination-by-instruction-section";
import CollapsibleSection from "./collapsible-section";

const HISTORY_WEEKS = 10;

function StatCard({
  title, value, icon: Icon, color, subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: "green" | "blue" | "yellow" | "red";
  subtitle?: string;
}) {
  const colorMap = {
    green: "bg-primary-light text-primary-strong",
    blue: "bg-info-light text-info-foreground",
    yellow: "bg-warning-light text-warning-foreground",
    red: "bg-danger-light text-destructive",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Trang Dashboard báo cáo trực quan cho Admin — tổng hợp hiệu suất nhân giống, tỉ lệ nhiễm và tiến độ
// chỉ định dạng biểu đồ, tách riêng khỏi /reports (dạng tab, thiên về số liệu/bảng chi tiết) theo yêu
// cầu đặt ở 1 trang Dashboard mới riêng.
export default async function ReportsOverviewPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/reports/overview"))) redirect("/dashboard");

  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const [dailyRecords, contamRecords, pendingDeviationCount] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { recordDate: { gte: buckets[0].start } },
      select: { motherUsed: true, items: { select: { stage: true, quantityCreated: true } } },
    }),
    prisma.contaminationRecord.aggregate({
      where: { recordDate: { gte: buckets[0].start } },
      _sum: { quantity: true },
    }),
    prisma.alert.count({ where: { type: "OUTPUT_DEVIATION", status: { not: "RESOLVED" } } }),
  ]);

  let motherUsedTotal = 0, motherOutputTotal = 0, finishedOutputTotal = 0;
  for (const rec of dailyRecords) {
    motherUsedTotal += rec.motherUsed;
    for (const item of rec.items) {
      if (item.stage === "MAU_ME") motherOutputTotal += item.quantityCreated;
      else finishedOutputTotal += item.quantityCreated;
    }
  }
  // Mẫu số tỉ lệ nhiễm dùng đúng số cụm M05 tạo ra trong cùng khung thời gian (motherOutputTotal ở trên)
  // — khớp cách tính ở contamination-report.tsx (Tỉ lệ nhiễm = số nhiễm / số tạo ra, không phải / số dùng).
  const contaminatedTotal = contamRecords._sum.quantity ?? 0;
  const producedForContamRate = motherOutputTotal;

  const pct = (n: number, d: number) => (d > 0 ? `${(Math.round((n / d) * 1000) / 10).toLocaleString("vi-VN")}%` : "—");
  // Hiện dạng hệ số (VD 1,8), không quy đổi ra % — cùng quy ước fmtRatio ở instructions/[id]/page.tsx.
  const ratio = (n: number, d: number) => (d > 0 ? (Math.round((n / d) * 100) / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "—");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary-strong" /> Thống kê trực quan
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Hiệu suất nhân giống, tỉ lệ nhiễm và tiến độ chỉ định — {HISTORY_WEEKS} tuần gần nhất
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tỉ lệ nhân MM trung bình"
          value={ratio(motherOutputTotal, motherUsedTotal)}
          icon={Sprout}
          color="green"
        />
        <StatCard
          title="Tỉ lệ ra TP trung bình"
          value={ratio(finishedOutputTotal, motherUsedTotal)}
          icon={Flower2}
          color="blue"
        />
        <StatCard
          title="Tỉ lệ nhiễm toàn hệ thống"
          value={pct(contaminatedTotal, producedForContamRate)}
          icon={ShieldAlert}
          color="yellow"
        />
        <StatCard
          title="Chỉ định đang lệch tiến độ"
          value={pendingDeviationCount.toLocaleString("vi-VN")}
          subtitle="Chưa xử lý xong (chọn nguyên nhân)"
          icon={AlertTriangle}
          color="red"
        />
      </div>

      <CollapsibleSection title="Xu hướng hệ số nhân MM / ra thành phẩm" icon={TrendingUp}>
        <RatioTrendSection />
      </CollapsibleSection>
      <CollapsibleSection title="Xếp hạng NV cấy mô theo tỉ lệ" icon={Trophy}>
        <StaffRankingSection />
      </CollapsibleSection>
      <CollapsibleSection title="Tỉ lệ nhiễm" icon={ShieldAlert}>
        <ContaminationBreakdownSection />
      </CollapsibleSection>
      <CollapsibleSection title="Tiến độ chỉ định cấy" icon={ClipboardList}>
        <InstructionProgressSection />
      </CollapsibleSection>
      <CollapsibleSection title="Nhiễm sau ủ tối theo chỉ định cấy" icon={Moon}>
        <DarkRoomContaminationByInstructionSection />
      </CollapsibleSection>
      <CollapsibleSection title="Mẫu mẹ dư được bàn giao lại" icon={Package}>
        <SurplusMotherReturnedSection />
      </CollapsibleSection>
    </div>
  );
}
