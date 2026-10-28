import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { listRndAssignableStaff } from "@/lib/rnd-instruction-create";

// Danh sách NV cấy mô cho ô "Giao cho" khi Admin kỹ thuật tạo chỉ định cấy R&D (Cấy sản xuất R&D) hoặc bắt
// đầu lượt cấy giống thử nghiệm — mọi NV cấy mô đang hoạt động, NV Kho sản xuất R&D xếp trước (xem
// listRndAssignableStaff). Admin kỹ thuật vẫn luôn tự giao được cho chính mình (lựa chọn mặc định ở UI).
export async function GET() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json(await listRndAssignableStaff());
}
