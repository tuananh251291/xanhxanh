import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PackageCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import ReceivePhongToiBoard from "./receive-phong-toi-board";
import ReceiveDoLaneBoard from "./receive-do-lane-board";
import ReceiveSurplusBoard from "./receive-surplus-board";

export default async function ReceivePhongToiPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/receive-phong-toi"))) redirect("/dashboard");
  // Chỉ NV kho mô mới có nghiệp vụ này — nhận bàn giao Phòng tối cho NV cấy mô cùng kho.
  if (role !== "KHO_MO") redirect("/dashboard");

  if (!session?.user?.workplaceWarehouseId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-info-foreground" /> Nhận bàn giao từ kho tối
          </h1>
        </div>
        <Card><CardContent className="py-12 text-center text-text-muted">
          Bạn chưa được gán địa điểm làm việc — liên hệ Admin cao nhất để được gán trước khi sử dụng tính năng này.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-info-foreground" /> Nhận bàn giao từ kho tối
        </h1>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-primary-strong">
          Danh sách các lô sản phẩm đang đợi trả về kho sáng - Luồng Xanh
        </h2>
        <ReceivePhongToiBoard />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-destructive">
          Danh sách các lô sản phẩm đang đợi trả về kho sáng - Luồng Đỏ
        </h2>
        <ReceiveDoLaneBoard />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-warning-foreground">
          Danh sách phiếu bàn giao MM dư (mẫu mẹ dư khi chỉ định kết thúc)
        </h2>
        <ReceiveSurplusBoard />
      </div>
    </div>
  );
}
