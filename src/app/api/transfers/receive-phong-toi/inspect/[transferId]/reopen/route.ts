import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { reopenTransferInspection, ReinspectError } from "@/lib/transfer-reinspect";

// Kho mô "Kiểm tra lại" — mở lại kết quả kiểm tra đã nhập sai của 1 phiếu bàn giao Phòng tối (chỉ các dòng
// chưa xếp kệ), xem reopenTransferInspection.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const { transferId } = await params;
  try {
    const result = await reopenTransferInspection(transferId, workplaceWarehouseId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof ReinspectError) return NextResponse.json({ message: e.message }, { status: e.status });
    throw e;
  }
}
