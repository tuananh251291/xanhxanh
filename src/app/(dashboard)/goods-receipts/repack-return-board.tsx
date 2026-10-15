import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { REPACK_STATUS_LABELS } from "@/types";
import RepackReturnReceiveForm from "./repack-return-receive-form";

// Tab "Nhận lại phiếu xử lý" — Phiếu xử lý Kho thành phẩm gửi sang khu sản xuất (RepackInstruction có
// ktpRoomId) mà Kho mô đã bàn giao lại (PENDING_RETURN): Kho thành phẩm nhập số thực nhận đạt/không đạt
// (gợi ý = số Kho mô kiểm tra) — đạt vào Phòng đạt tiêu chuẩn, không đạt quay lại Phòng chờ xử lý. Kèm
// danh sách phiếu đang xử lý ở khu sản xuất để theo dõi.
export default async function RepackReturnBoard({ warehouseId }: { warehouseId: string | null }) {
  if (!warehouseId) {
    return <Card><CardContent className="py-8 text-center text-text-muted">Bạn chưa được gán địa điểm làm việc (kho thành phẩm).</CardContent></Card>;
  }
  const instructions = await prisma.repackInstruction.findMany({
    where: { ktpRoom: { warehouseId }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, code: true, status: true, createdAt: true, returnedAt: true,
      inputStageCode: true, inputQuantity: true, outputStageCode: true,
      confirmedPassedQuantity: true, confirmedFailedQuantity: true,
      plantType: { select: { code: true, name: true } },
      productionWarehouse: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });

  const pending = instructions.filter((i) => i.status === "PENDING_RETURN");
  const inProgress = instructions.filter((i) => i.status !== "PENDING_RETURN");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Chờ Kho thành phẩm nhận lại</h2>
        {pending.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-text-muted">Không có phiếu xử lý nào đang chờ nhận lại</CardContent></Card>
        ) : (
          pending.map((i) => (
            <Card key={i.id} className="border border-info-light">
              <CardContent className="py-4 space-y-3">
                <div>
                  <p className="font-mono font-medium text-info-foreground">{i.code}</p>
                  <p className="text-sm text-text-secondary">
                    {i.plantType.code} — {i.plantType.name} · {i.inputQuantity.toLocaleString("vi-VN")} cây {i.inputStageCode} → {i.outputStageCode} · {i.productionWarehouse?.name}
                    {i.returnedAt && ` · Kho mô bàn giao ${format(i.returnedAt, "HH:mm dd/MM/yyyy", { locale: vi })}`}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Kho mô kiểm tra: {i.confirmedPassedQuantity ?? 0} đạt / {i.confirmedFailedQuantity ?? 0} không đạt
                  </p>
                </div>
                <RepackReturnReceiveForm
                  id={i.id}
                  defaultPassed={i.confirmedPassedQuantity ?? 0}
                  defaultFailed={i.confirmedFailedQuantity ?? 0}
                  maxTotal={i.inputQuantity}
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {inProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">Đang xử lý ở khu sản xuất</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã phiếu</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã cây</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Số lượng</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Khu sản xuất</th>
                      <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inProgress.map((i) => (
                      <tr key={i.id} className="border-b last:border-0 even:bg-primary-light">
                        <td className="px-4 py-3 font-mono text-info-foreground">{i.code}</td>
                        <td className="px-4 py-3 text-foreground">{i.plantType.code}</td>
                        <td className="px-4 py-3 text-foreground">{i.inputQuantity.toLocaleString("vi-VN")} cây {i.inputStageCode} → {i.outputStageCode}</td>
                        <td className="px-4 py-3 text-text-secondary">{i.productionWarehouse?.name}{i.assignedTo ? ` · NV ${i.assignedTo.name}` : ""}</td>
                        <td className="px-4 py-3"><Badge variant="in-progress">{REPACK_STATUS_LABELS[i.status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
