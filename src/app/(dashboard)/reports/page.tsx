import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import ProductionReport from "./production-report";
import ContaminationReport from "./contamination-report";
import PlanVsActualReport from "./plan-vs-actual-report";
import InventoryLifecycleReport from "./inventory-lifecycle-report";
import ChecklistReport from "./checklist-report";

export default async function ReportsPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/reports"))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-strong" /> Báo cáo
        </h1>
        <p className="text-text-secondary text-sm mt-1">Tổng hợp sản lượng, tỉ lệ nhiễm, kế hoạch và tồn kho</p>
      </div>

      <Tabs defaultValue="production">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="production" className="whitespace-nowrap">Sản lượng</TabsTrigger>
            <TabsTrigger value="contamination" className="whitespace-nowrap">Tỉ lệ nhiễm</TabsTrigger>
            <TabsTrigger value="plan" className="whitespace-nowrap">Kế hoạch vs thực tế</TabsTrigger>
            <TabsTrigger value="inventory" className="whitespace-nowrap">Tồn kho & vòng đời</TabsTrigger>
            <TabsTrigger value="checklist" className="whitespace-nowrap">Checklist</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="production" className="mt-4">
          <ProductionReport />
        </TabsContent>
        <TabsContent value="contamination" className="mt-4">
          <ContaminationReport />
        </TabsContent>
        <TabsContent value="plan" className="mt-4">
          <PlanVsActualReport />
        </TabsContent>
        <TabsContent value="inventory" className="mt-4">
          <InventoryLifecycleReport />
        </TabsContent>
        <TabsContent value="checklist" className="mt-4">
          <ChecklistReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
