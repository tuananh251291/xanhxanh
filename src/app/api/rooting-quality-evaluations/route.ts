import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listRootingEvaluationsForViewer } from "@/lib/rooting-quality-evaluation";

// Danh sách đánh giá — dùng cho cả màn "Đánh giá chất lượng cây ra rễ" (KY_THUAT, lọc status=PENDING,
// chỉ thấy việc của chính mình) lẫn trang báo cáo lịch sử (KHO_MO/KY_THUAT/Admin, thường lọc
// status=COMPLETED). KY_THUAT chỉ thấy đánh giá được giao cho MÌNH; KHO_MO chỉ thấy đúng kho mình đang
// làm việc; Quản lý kho TP chỉ thấy đánh giá đã HOÀN THÀNH (lượng hàng sắp về) của mọi khu sản xuất; Admin
// thấy tất cả.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const evaluations = await listRootingEvaluationsForViewer(
    { id: session.user.id, role, workplaceWarehouseId: session.user.workplaceWarehouseId },
    { status }
  );
  if (!evaluations) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json(evaluations);
}
