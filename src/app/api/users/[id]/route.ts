import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateUserCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import bcrypt from "bcryptjs";
import { z } from "zod";

const ROLES = ["ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI"] as const;

// Chỉ NV kho mô/cấy mô/môi trường mới bị ràng buộc làm việc với đúng 1 kho sản xuất — NV kỹ thuật
// làm việc được ở mọi kho nên không gán field này.
const WORKPLACE_ROLES = ["KHO_MO", "CAY_MO", "MOI_TRUONG"] as const;

const patchSchema = z.union([
  z.object({ status: z.literal("APPROVED"), role: z.enum(ROLES) }),
  z.object({ status: z.literal("REJECTED") }),
  z.object({ workplaceWarehouseId: z.string().nullable() }),
  z.object({ inspectionLane: z.enum(["XANH", "DO"]).nullable() }),
  z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(ROLES),
    isActive: z.boolean(),
    password: z.string().min(6).optional(),
  }),
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

    // NV cấy mô vừa được gán kho sản xuất → tự động sinh Phòng tối cá nhân ngay (không đợi lần nhập
    // nhật ký cấy đầu tiên), để đã xuất hiện sẵn trong Kho & Giàn kệ / Phòng tối cho Admin/Kho mô xem.
    if (target.role === "CAY_MO" && workplaceWarehouseId) {
      await getOrCreatePersonalDarkRoom(id, workplaceWarehouseId);
    }

    return NextResponse.json(updated);
  }

  // Luồng kiểm tra — NV kho mô cài đặt cho đúng NV cấy mô thuộc cùng kho sản xuất mình đang làm việc.
  if ("inspectionLane" in parsed.data) {
    if (session?.user?.role !== "KHO_MO") {
      return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền cài đặt luồng kiểm tra" }, { status: 403 });
    }
    if (!session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc — không thể cài đặt" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, workplaceWarehouseId: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role !== "CAY_MO") {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV cấy mô" }, { status: 400 });
    }
    if (target.workplaceWarehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ được cài đặt cho NV cấy mô thuộc cùng kho sản xuất bạn đang làm việc" }, { status: 403 });
    }
    const { inspectionLane } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      data: { inspectionLane },
      select: { id: true, code: true, name: true, inspectionLane: true },
    });
    return NextResponse.json(updated);
  }

  // Sửa thông tin chung tài khoản (tên/email/vai trò/kích hoạt/đổi mật khẩu) — chỉ Admin cao nhất.
  if ("name" in parsed.data) {
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền sửa tài khoản" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json({ message: "Không thể sửa tài khoản Admin cao nhất qua đây" }, { status: 403 });
    }

    const { name, email, role, isActive, password } = parsed.data;
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.id !== id) {
      return NextResponse.json({ message: "Email đã được dùng bởi tài khoản khác" }, { status: 409 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role,
        isActive,
        // Đổi vai trò thì mã cũ không còn đúng định dạng nữa (tiền tố theo vai trò) — sinh mã mới.
        ...(role !== target.role ? { code: await generateUserCode(role) } : {}),
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
      select: { id: true, code: true, name: true, email: true, role: true, isActive: true },
    });
    return NextResponse.json(updated);
  }

  // Chỉ Admin cao nhất (SUPER_ADMIN) được duyệt/từ chối tài khoản mới — Admin thường không có quyền này.
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền duyệt tài khoản" }, { status: 403 });
  }

  // Vai trò chỉ được chọn lúc duyệt — sinh mã thật theo đúng định dạng vai trò ở đây, thay cho mã tạm
  // "TEMPxxxx" gán lúc đăng ký (xem generateUserCode).
  const data = "role" in parsed.data ? { ...parsed.data, code: await generateUserCode(parsed.data.role) } : parsed.data;

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, code: true, name: true, email: true, role: true, status: true },
  });

  return NextResponse.json(user);
}
