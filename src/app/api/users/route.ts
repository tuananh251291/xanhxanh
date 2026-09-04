import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { creatableRolesFor } from "@/types";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  // Vai trò được validate lại theo đúng người tạo (creatableRolesFor) bên dưới — enum ở đây chỉ chặn giá
  // trị rác, KHÔNG chặn SUPER_ADMIN vì đã tự loại khỏi creatableRolesFor với mọi vai trò người tạo.
  role: z.enum(["ADMIN", "ADMIN_KY_THUAT", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI", "HANH_CHINH_NHAN_SU", "NHAN_VIEN_SAN_XUAT", "NHAN_VIEN_QUAN_LY_VUON"]),
  code: z.string().min(1, "Nhập mã nhân viên"),
  // Chỉ áp dụng khi tạo tài khoản SALE — gán sẵn kho thành phẩm làm việc (Phòng đạt tiêu chuẩn xem mặc định)
  // và các Phòng thị trường được cấp quyền xem thêm, tránh phải cấu hình lại ở 2 chỗ khác sau khi tạo.
  workplaceWarehouseId: z.string().optional(),
  marketRoomIds: z.array(z.string()).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: {
      id: true, code: true, name: true, email: true, role: true, status: true, isActive: true, createdAt: true,
      workplaceWarehouseId: true,
      workplaceWarehouse: { select: { code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const allowedRoles = creatableRolesFor(session?.user?.role);
  if (allowedRoles.length === 0) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { name, email, password, role, code, workplaceWarehouseId, marketRoomIds } = parsed.data;

  // NV Hành chính nhân sự chỉ tạo được tài khoản vị trí nhân viên, không tạo được tài khoản Admin.
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ message: "Không có quyền tạo tài khoản vai trò này" }, { status: 403 });
  }

  if (workplaceWarehouseId !== undefined && role !== "SALE") {
    return NextResponse.json({ message: "Kho thành phẩm làm việc chỉ áp dụng khi tạo tài khoản Sale" }, { status: 400 });
  }
  if (marketRoomIds !== undefined && role !== "SALE") {
    return NextResponse.json({ message: "Phòng thị trường chỉ áp dụng khi tạo tài khoản Sale" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "Email đã tồn tại" }, { status: 409 });
  }
  const codeOwner = await prisma.user.findUnique({ where: { code } });
  if (codeOwner) {
    return NextResponse.json({ message: "Mã nhân viên đã được dùng cho tài khoản khác" }, { status: 409 });
  }

  if (workplaceWarehouseId) {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: workplaceWarehouseId }, select: { type: true } });
    if (!warehouse || warehouse.type !== "THANH_PHAM") {
      return NextResponse.json({ message: "Địa điểm làm việc phải là kho thành phẩm" }, { status: 400 });
    }
  }
  if (marketRoomIds && marketRoomIds.length > 0) {
    const rooms = await prisma.room.findMany({ where: { id: { in: marketRoomIds } }, select: { id: true, type: true } });
    if (rooms.length !== marketRoomIds.length || rooms.some((r) => r.type !== "PHONG_THI_TRUONG")) {
      return NextResponse.json({ message: "Danh sách Phòng thị trường không hợp lệ" }, { status: 400 });
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  // NV cấy mô mới tạo luôn bắt đầu ở "Thử việc" + "Cấy học việc" — HR/Admin cấp cao gỡ dần qua PATCH
  // /api/users/[id] khi NV rời giai đoạn học việc rồi lên chính thức (xem User.employmentType/isTrainee).
  const isNewCayMo = role === "CAY_MO";
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        code, name, email, password: hashed, role, status: "APPROVED", workplaceWarehouseId,
        ...(isNewCayMo ? { employmentType: "THU_VIEC", isTrainee: true } : {}),
      },
      select: { id: true, code: true, name: true, email: true, role: true },
    });
    if (marketRoomIds && marketRoomIds.length > 0) {
      await tx.roomAccess.createMany({ data: marketRoomIds.map((roomId) => ({ userId: created.id, roomId })) });
    }
    return created;
  });

  return NextResponse.json(user, { status: 201 });
}
