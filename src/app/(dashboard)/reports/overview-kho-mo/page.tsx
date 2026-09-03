import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { isPageAllowed } from "@/lib/permissions";
import { isNearExpiry } from "@/lib/report-utils";
import { TrendingUp, Sun, Moon, Clock, PackageCheck, Leaf } from "lucide-react";
import DarkRoomInflowTrendSection from "./dark-room-inflow-trend-section";
import BrightRoomStockByTypeSection from "./bright-room-stock-by-type-section";
import DarkRoomContaminationByInstructionSection from "../overview/dark-room-contamination-by-instruction-section";
import SurplusMotherReturnedSection from "../overview/surplus-mother-returned-section";
import MotherContaminationReport from "../mother-contamination-report";
import CollapsibleSection from "../overview/collapsible-section";

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

// Trang "Thống kê trực quan" cho NV kho mô — cùng khung/hạ tầng biểu đồ với /reports/overview (NV kỹ
// thuật) nhưng nội dung xoay quanh đúng nghiệp vụ kho mô: tồn kho phòng sáng/phòng tối hiện tại, phiếu
// bàn giao chờ xử lý, xu hướng nhận từ phòng tối, cộng thêm 3 mục nhiễm/mẫu mẹ dư đã có sẵn (đúng phạm vi
// kho mô đang quản lý: phòng tối cá nhân + mẫu mẹ). Lọc theo ĐÚNG kho sản xuất NV đang được gán
// (workplaceWarehouseId) — null (chưa gán, hoặc Admin xem) thì hiện toàn hệ thống, giống quy ước ở
// getKhoMoDailyStats (dashboard/page.tsx).
export default async function ReportsOverviewKhoMoPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/reports/overview-kho-mo"))) redirect("/dashboard");

  const warehouseId = role === "KHO_MO" ? session?.user?.workplaceWarehouseId ?? null : null;

  const [brightRoomLots, darkRoomLots, pendingTransfers] = await Promise.all([
    prisma.lot.aggregate({
      where: {
        status: "ACTIVE",
        shelf: { room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } }, ...(warehouseId ? { warehouseId } : {}) },
      },
      _sum: { quantity: true },
    }),
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        room: { type: "PHONG_TOI", ...(warehouseId ? { warehouseId } : {}) },
      },
      select: { quantity: true, expectedMoveAt: true },
    }),
    prisma.transfer.count({
      where: { status: "PENDING", fromRoom: { type: "PHONG_TOI", ...(warehouseId ? { warehouseId } : {}) } },
    }),
  ]);

  const darkRoomTotal = darkRoomLots.reduce((s, l) => s + l.quantity, 0);
  const darkRoomDueSoonCount = darkRoomLots.filter((l) => isNearExpiry(l.expectedMoveAt)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary-strong" /> Thống kê trực quan
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tồn kho phòng sáng/phòng tối, tỉ lệ nhiễm và mẫu mẹ dư — {warehouseId ? "kho đang được gán" : "toàn hệ thống"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tồn kho phòng sáng"
          value={(brightRoomLots._sum.quantity ?? 0).toLocaleString("vi-VN")}
          icon={Sun}
          color="green"
        />
        <StatCard
          title="Đang ủ phòng tối"
          value={darkRoomTotal.toLocaleString("vi-VN")}
          icon={Moon}
          color="blue"
        />
        <StatCard
          title="Sắp/đã đến hạn chuyển kho"
          value={darkRoomDueSoonCount.toLocaleString("vi-VN")}
          subtitle="Còn ≤ 3 ngày hoặc đã quá hạn"
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Phiếu bàn giao chờ xác nhận"
          value={pendingTransfers.toLocaleString("vi-VN")}
          subtitle="Từ phòng tối cá nhân"
          icon={PackageCheck}
          color="red"
        />
      </div>

      <CollapsibleSection title="Xu hướng nhận bàn giao từ phòng tối" icon={<TrendingUp className="w-4 h-4 shrink-0" />} defaultOpen>
        <DarkRoomInflowTrendSection warehouseId={warehouseId} />
      </CollapsibleSection>
      <CollapsibleSection title="Tồn kho phòng sáng theo mã cây" icon={<Sun className="w-4 h-4 shrink-0" />}>
        <BrightRoomStockByTypeSection warehouseId={warehouseId} />
      </CollapsibleSection>
      <CollapsibleSection title="Nhiễm sau ủ tối theo chỉ định cấy" icon={<Moon className="w-4 h-4 shrink-0" />}>
        <DarkRoomContaminationByInstructionSection />
      </CollapsibleSection>
      <CollapsibleSection title="Tỉ lệ nhiễm mẫu mẹ bàn giao" icon={<Leaf className="w-4 h-4 shrink-0" />}>
        <MotherContaminationReport />
      </CollapsibleSection>
      <CollapsibleSection title="Mẫu mẹ dư được bàn giao lại" icon={<PackageCheck className="w-4 h-4 shrink-0" />}>
        <SurplusMotherReturnedSection />
      </CollapsibleSection>
    </div>
  );
}
