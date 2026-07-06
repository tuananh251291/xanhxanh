import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const ROLES = ["ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI"] as const;

// Chỉ NV kho mô/cấy mô/môi trường mới bị ràng buộc làm việc với đúng 1 kho sản xuất — NV kỹ thuật
// làm việc được ở mọi kho nên không gán field này.
const WORKPLACE_ROLES = ["KHO_MO", "CAY_MO", "MOI_TRUONG"] as const;

const patchSchema = z.union([
  z.object({ status: z.literal("APPROVED"), role: z.enum(ROLES) }),
  z.object({ status: z.literal("REJECTED") }),
  z.object({ workplaceWarehouseId: z.string().nullable() }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  // Địa điểm làm việc — chỉ Admin cao nhất được gán, chỉ áp dụng cho 3 vai trò cố định.
  if ("workplaceWarehouseId" in parsed.data) {
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền gán địa điểm làm việc" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (!target.role || !WORKPLACE_ROLES.includes(target.role as (typeof WORKPLACE_ROLES)[number])) {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV kho mô, cấy mô, môi trường" }, { status: 400 });
    }
    const { workplaceWarehouseId } = parsed.data;
    if (workplaceWarehouseId) {
      const warehouse = await prisma.warehouse.findUnique({ where: { id: workplaceWarehouseId }, select: { type: true } });
      if (!warehouse || warehouse.type !== "SAN_XUAT") {
        return NextResponse.json({ message: "Địa điểm làm việc phải là kho sản xuất" }, { status: 400 });
      }
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { workplaceWarehouseId },
      select: { id: true, code: true, name: true, email: true, role: true, workplaceWarehouse: { select: { code: true, name: true } } },
    });
    return NextResponse.json(updated);
  }

  // Chỉ Admin cao nhất (SUPER_ADMIN) được duyệt/từ chối tài khoản mới — Admin thường không có quyền này.
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền duyệt tài khoản" }, { status: 403 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, code: true, name: true, email: true, role: true, status: true },
  });

  return NextResponse.json(user);
}
