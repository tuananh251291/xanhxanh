"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import NewVarietyManager from "./new-variety-manager";
import ProductionProgressTracker from "./production-progress-tracker";

export default function RndBoard() {
  return (
    <Tabs defaultValue="varieties">
      <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="varieties" className="whitespace-nowrap">Quản lý giống mới</TabsTrigger>
          <TabsTrigger value="progress" className="whitespace-nowrap">Cập nhật tiến độ sản xuất</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="varieties" className="mt-4">
        <NewVarietyManager />
      </TabsContent>
      <TabsContent value="progress" className="mt-4">
        <ProductionProgressTracker />
      </TabsContent>
    </Tabs>
  );
}
