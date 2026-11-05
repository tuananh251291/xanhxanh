import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { FORECAST_RATE_KEY, FORECAST_REGISTERED_UPLOAD_KEY } from "@/lib/finished-stock-forecast-calc";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configs = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json(configs);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json() as { key: string; value: string }[];
  if (!Array.isArray(body)) return NextResponse.json({ message: "Cần mảng [{key, value}]" }, { status: 400 });
  // Tỉ lệ tính tồn dự kiến chỉ Admin cấp cao được đổi. Trang Cài đặt luôn gửi cả bộ tham số nên với Admin khác chỉ
  // bỏ qua key này thay vì từ chối cả lần lưu.
  const allowed = body.filter(({ key, value }) => {
    // Số đăng ký tải file chỉ ghi qua /api/finished-forecast/registered — không để bản cũ trên trang Cài đặt đè lên.
    if (key === FORECAST_REGISTERED_UPLOAD_KEY) return false;
    if (key !== FORECAST_RATE_KEY) return true;
    const pct = Number(value);
    return session?.user?.role === "SUPER_ADMIN" && Number.isInteger(pct) && pct >= 0 && pct <= 100;
  });
  const updated = await Promise.all(
    allowed.map(({ key, value }) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );
  return NextResponse.json(updated);
}
