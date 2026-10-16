import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidSuperAdmin, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { orchidAccountSettingSchema, orchidWarehouseSettingSchema, orchidCategorySettingSchema } from "@/lib/orchid/schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidSuperAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind");
  const body = await req.json();
  return handleOrchidError(async () => {
    if (kind === "account") {
      const p = orchidAccountSettingSchema.safeParse(body);
      if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return NextResponse.json(await prisma.orchidPaymentAccount.update({ where: { id }, data: p.data }));
    }
    if (kind === "warehouse") {
      const p = orchidWarehouseSettingSchema.safeParse(body);
      if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return NextResponse.json(await prisma.orchidWarehouse.update({ where: { id }, data: p.data }));
    }
    if (kind === "category") {
      const p = orchidCategorySettingSchema.safeParse(body);
      if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return NextResponse.json(await prisma.orchidExpenseCategory.update({ where: { id }, data: p.data }));
    }
    return badRequest("Loại cấu hình không hợp lệ");
  });
}
