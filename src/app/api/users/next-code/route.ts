import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole, ROLE_LABELS } from "@/types";
import { generateUserCode } from "@/lib/codes";
import type { UserRole } from "@prisma/client";

// Chỉ dùng để gợi ý (prefill) ô nhập mã lúc duyệt tài khoản — Admin vẫn nhập/sửa tay mã thật.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const role = req.nextUrl.searchParams.get("role") as UserRole | null;
  if (!role || !(role in ROLE_LABELS)) {
    return NextResponse.json({ message: "Vai trò không hợp lệ" }, { status: 400 });
  }

  const code = await generateUserCode(role);
  return NextResponse.json({ code });
}
