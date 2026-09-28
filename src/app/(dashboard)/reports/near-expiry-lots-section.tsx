"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import PlantTypeMultiFilter from "@/components/shared/plant-type-multi-filter";
import StageLotTable, { type StageLotRow } from "./stage-lot-table";

type PlantType = { id: string; code: string; name: string };

const isOverdue = (l: StageLotRow) => l.expectedMoveAt !== null && differenceInCalendarDays(l.expectedMoveAt, new Date()) < 0;

// Bọc quanh 2 bảng Mẫu mẹ/Thành phẩm ở "Lô sắp/quá hạn chuyển giai đoạn" (xem
// inventory-lifecycle-report.tsx) — thêm ô lọc "Mã cây" (gõ có đề xuất, chọn được nhiều mã cùng lúc,
// tái dùng PlantTypeMultiFilter đang dùng ở các báo cáo khác). plantTypes chỉ gồm các mã CÓ MẶT trong
// danh sách sắp/quá hạn (không phải toàn bộ mã cây trong hệ thống) — gợi ý gõ ra mã nào cũng có kết quả,
// đỡ chọn nhầm mã không liên quan. Banner tổng số quá hạn tính lại theo đúng tập đã lọc, để khớp với
// bảng bên dưới thay vì hiện tổng cố định của toàn bộ danh sách.
export default function NearExpiryLotsSection({
  motherLots, finishedLots, plantTypes,
}: {
  motherLots: StageLotRow[];
  finishedLots: StageLotRow[];
  plantTypes: PlantType[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filteredMother = useMemo(
    () => (selectedIds.length === 0 ? motherLots : motherLots.filter((l) => selectedIds.includes(l.plantTypeId))),
    [motherLots, selectedIds]
  );
  const filteredFinished = useMemo(
    () => (selectedIds.length === 0 ? finishedLots : finishedLots.filter((l) => selectedIds.includes(l.plantTypeId))),
    [finishedLots, selectedIds]
  );
  const overdueMotherQuantity = useMemo(
    () => filteredMother.filter(isOverdue).reduce((sum, l) => sum + l.quantity, 0),
    [filteredMother]
  );
  const overdueFinishedQuantity = useMemo(
    () => filteredFinished.filter(isOverdue).reduce((sum, l) => sum + l.quantity, 0),
    [filteredFinished]
  );

  const totalLots = motherLots.length + finishedLots.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lô sắp/quá hạn chuyển giai đoạn</CardTitle>
        <p className="text-sm text-text-secondary">Còn ≤3 ngày hoặc đã quá hạn dự kiến chuyển giai đoạn</p>
        {totalLots > 0 && (
          <div className="pt-2 space-y-1">
            <Label className="text-xs">Lọc theo mã cây</Label>
            <PlantTypeMultiFilter plantTypes={plantTypes} selectedIds={selectedIds} onChange={setSelectedIds} />
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {totalLots === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Không có lô nào sắp/quá hạn</p>
        ) : (
          <div className="divide-y divide-divider">
            <div className="p-4">
              <h3 className="font-bold text-primary-strong mb-2">Mẫu mẹ — chờ cấy chuyển</h3>
              {overdueMotherQuantity > 0 && (
                <div className="mb-3">
                  <p className="text-sm bg-danger-light text-destructive rounded-md px-3 py-2">
                    <strong>{overdueMotherQuantity.toLocaleString("vi-VN")} cụm</strong> đã quá hạn cấy chuyển (chưa ra chỉ định cấy)
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Chỉ tính các lô đã QUÁ HẠN (badge đỏ bên dưới) — chưa gồm các lô còn ≤3 ngày (badge vàng) đang hiển thị chung trong bảng.
                  </p>
                </div>
              )}
              <StageLotTable lots={filteredMother} />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-primary-strong mb-2">Thành phẩm — chờ chuyển kho</h3>
              {overdueFinishedQuantity > 0 && (
                <div className="mb-3">
                  <p className="text-sm bg-danger-light text-destructive rounded-md px-3 py-2">
                    <strong>{overdueFinishedQuantity.toLocaleString("vi-VN")} cây</strong> đã quá hạn chuyển kho thành phẩm
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Chỉ tính các lô đã QUÁ HẠN (badge đỏ bên dưới) — chưa gồm các lô còn ≤3 ngày (badge vàng) đang hiển thị chung trong bảng.
                  </p>
                </div>
              )}
              <StageLotTable lots={filteredFinished} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
