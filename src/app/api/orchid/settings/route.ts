import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidSuperAdmin, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { orchidAccountSettingSchema, orchidWarehouseSettingSchema, orchidCategorySettingSchema } from "@/lib/orchid/schemas";

// Cấu hình Dự án hoa lan (chỉ Admin hoa lan): tài khoản nhận/chi tiền, kho, loại chi phí.
// POST ?kind=account|warehouse|category tạo mới; PATCH /api/orchid/settings/[id]?kind=... sửa.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidSuperAdmin();
  if ("error" in guard) return guard.error;
  const kind = req.nextUrl.searchParams.get("kind");
  const body = await req.json();
  return handleOrchidError(async () => {
    if (kind === "account") {
      const p = orchidAccountSettingSchema.safeParse(body);
      if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return NextResponse.json(await prisma.orchidPaymentAccount.create({ data: p.data }), { status: 201 });
    }
    if (kind === "warehouse") {
      const p = orchidWarehouseSettingSchema.safeParse(body);
      if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return NextResponse.json(await prisma.orchidWarehouse.create({ data: p.data }), { status: 201 });
    }
    if (kind === "category") {
      const p = orchidCategorySettingSchema.safeParse(body);
      if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return NextResponse.json(await prisma.orchidExpenseCategory.create({ data: p.data }), { status: 201 });
    }
    return badRequest("Loại cấu hình không hợp lệ");
  });
}
