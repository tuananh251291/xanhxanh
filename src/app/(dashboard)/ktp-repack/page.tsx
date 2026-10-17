import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { getManagerWeeklyData } from "@/lib/finished-goods-weekly";
import KtpRepackForm from "./ktp-repack-form";

// "Tạo phiếu xử lý" — mục menu riêng của Quản lý kho thành phẩm (trước đây là việc tuần "Phiếu xử lý"), tạo
// bất cứ lúc nào từ tồn Phòng chờ xử lý của kho đang làm việc. Xem POST /api/ktp-repack-instructions.
export default async function KtpRepackPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "QUAN_LY_KHO_THANH_PHAM" || !(await isPageAllowed(role, "/ktp-repack"))) redirect("/dashboard");
  const warehouseId = session?.user?.workplaceWarehouseId;
  if (!warehouseId) {
    return <p className="text-sm text-destructive">Bạn chưa được gán kho làm việc — liên hệ Admin.</p>;
  }

  const data = await getManagerWeeklyData(warehouseId);
  return (
    <KtpRepackForm
      hasProcessingRoom={!!data.processingRoom}
      processingStock={data.processingStock}
      productionWarehouses={data.productionWarehouses}
    />
  );
}
