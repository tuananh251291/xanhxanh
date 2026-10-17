import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Recycle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import Link from "next/link";
import CompleteProcessingRequestButton from "./complete-processing-request-button";

// "Xử lý cây" — chỉ còn danh sách Yêu cầu xử lý cây của đơn hàng (tách/ghép túi khi Sale xác nhận đơn, Kho
// thành phẩm bấm "Hoàn thành xử lý" — xem PATCH /api/order-processing-requests/[id]). Phiếu xử lý nội bộ
// (ProcessingTicket, mã XL-, đổi quy cách ngay trong Phòng đạt tiêu chuẩn) ĐÃ BỎ — mọi phiếu xử lý giờ phải
// chọn khu sản xuất gửi đi, tạo ở "Tạo phiếu xử lý" (/ktp-repack). Bảng processing_tickets giữ lại để tra cứu.

export default async function ProcessingPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/processing"))) redirect("/dashboard");

  const [pendingRequests] = await Promise.all([
    prisma.orderProcessingRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, code: true, sourceStageCode: true, neededQuantity: true, bagSize: true, deductQuantity: true, surplusQuantity: true,
        order: { select: { code: true } }, plantType: { select: { code: true, name: true } },
        room: { select: { name: true, type: true, warehouse: { select: { name: true } } } },
        targetRoom: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Recycle className="w-6 h-6 text-primary-strong" /> Xử lý cây
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Yêu cầu xử lý cây của đơn hàng (tách/ghép túi) đang chờ Kho thành phẩm hoàn thành.
        </p>
      </div>

      {role === "QUAN_LY_KHO_THANH_PHAM" && (
        <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3">
          Cần gửi cây đi xử lý (đổi quy cách, xử lý lá vàng…)? Chuyển cây vào Phòng chờ xử lý ở{" "}
          <Link href="/room-moves" className="font-medium underline underline-offset-2">Luân chuyển nội bộ</Link>, rồi tạo phiếu ở{" "}
          <Link href="/ktp-repack" className="font-medium underline underline-offset-2">Tạo phiếu xử lý</Link> (chọn khu sản xuất nhận).
        </p>
      )}

      {pendingRequests.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">Không có yêu cầu xử lý đơn hàng nào đang chờ</p>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Yêu cầu xử lý đơn hàng — chờ xử lý</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pendingRequests.map((r) => {
              // Nguồn không phải Phòng đạt tiêu chuẩn (Kho hàn túi/Theo dõi) — cần chuyển phòng thay vì
              // mở túi lớn hơn, xem PATCH /api/order-processing-requests/[id].
              const isRoomTransfer = r.room.type !== "PHONG_DAT_TIEU_CHUAN";
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background rounded-lg border border-divider">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{r.code} · Đơn {r.order.code}</p>
                    <p className="text-xs text-text-secondary">
                      {r.plantType.name} ({r.plantType.code}) · {r.room.warehouse.name} — {r.room.name} · Cần {r.neededQuantity.toLocaleString("vi-VN")} cây (túi {r.sourceStageCode}, {r.bagSize} cây/túi)
                      {isRoomTransfer
                        ? ` → chuyển ${r.deductQuantity.toLocaleString("vi-VN")} cây sang Phòng đạt tiêu chuẩn${r.targetRoom ? ` (${r.targetRoom.name})` : ""}${r.surplusQuantity > 0 ? `, dư ${r.surplusQuantity.toLocaleString("vi-VN")} cây trả về T01` : ""}`
                        : ` → mở ${r.deductQuantity.toLocaleString("vi-VN")} cây, dư ${r.surplusQuantity.toLocaleString("vi-VN")} cây trả về T01`}
                    </p>
                  </div>
                  <CompleteProcessingRequestButton
                    requestId={r.id}
                    code={r.code}
                    sourceStageCode={r.sourceStageCode}
                    neededQuantity={r.neededQuantity}
                    deductQuantity={r.deductQuantity}
                    surplusQuantity={r.surplusQuantity}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

