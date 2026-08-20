import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ROLE_LABELS, creatableRolesFor } from "@/types";
import { generateUserCode } from "@/lib/codes";
import type { UserRole } from "@prisma/client";

// Chỉ dùng để gợi ý (prefill) ô nhập mã lúc tạo/duyệt tài khoản — Admin/NV Hành chính nhân sự vẫn
// nhập/sửa tay mã thật. Cùng điều kiện quyền với tạo tài khoản (POST /api/users).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (creatableRolesFor(session?.user?.role).length === 0) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const role = req.nextUrl.searchParams.get("role") as UserRole | null;
  if (!role || !(role in ROLE_LABELS)) {
    return NextResponse.json({ message: "Vai trò không hợp lệ" }, { status: 400 });
  }

  const code = await generateUserCode(role);
  return NextResponse.json({ code });
}
