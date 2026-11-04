import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upsertExternalLogin } from "@/lib/orchid/accounts";
import { badRequest, handleOrchidError } from "@/lib/orchid/server";
import { z } from "zod";

const schema = z
  .object({
    name: z.string().min(2).optional(),
    isActive: z.boolean().optional(),
    allowsReturn: z.boolean().optional(),
    returnWindowDays: z.number().int().positive().nullable().optional(),
    // Để trống = giữ nguyên email/mật khẩu hiện có. loginActive = khoá/mở đăng nhập, không đổi trạng thái NCC.
    loginEmail: z.union([z.literal(""), z.string().trim().email("Email đăng nhập không hợp lệ")]).optional(),
    loginPassword: z.union([z.literal(""), z.string().min(6, "Mật khẩu đăng nhập tối thiểu 6 ký tự")]).optional(),
    loginActive: z.boolean().optional(),
  })
  .refine((d) => !d.allowsReturn || d.returnWindowDays === undefined || (d.returnWindowDays !== null && d.returnWindowDays > 0), {
    message: "Cần nhập số ngày được phép trả hàng (lớn hơn 0)",
    path: ["returnWindowDays"],
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền sửa nhà cung cấp" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { loginEmail, loginPassword, loginActive, ...data } = parsed.data;
  if (data.allowsReturn === false) data.returnWindowDays = null;

  const current = await prisma.supplier.findUnique({ where: { id }, select: { name: true, userId: true } });
  if (!current) return NextResponse.json({ message: "Không tìm thấy nhà cung cấp" }, { status: 404 });
  if (!current.userId && loginPassword && !loginEmail) return badRequest("Cần nhập email đăng nhập để tạo tài khoản cho nhà cung cấp");

  return handleOrchidError(async () => {
    const item = await prisma.$transaction(async (tx) => {
      const userId = await upsertExternalLogin(tx, {
        userId: current.userId,
        role: "NHA_CUNG_CAP",
        name: data.name ?? current.name,
        email: loginEmail,
        password: loginPassword,
        isActive: loginActive,
      });
      return tx.supplier.update({ where: { id }, data: { ...data, userId } });
    });
    return NextResponse.json(item);
  });
}

// Xóa cứng — khác warehouses/rooms/shelves (soft-delete vì Lot có thể còn tham chiếu tới lịch sử tồn
// kho). Supplier không giữ lịch sử tồn kho trực tiếp, chỉ chặn nếu đã có phiếu nhập hàng (GoodsReceipt,
// supplierId bắt buộc — không thể chỉ gỡ tham chiếu như shelf-groups).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền xóa nhà cung cấp" }, { status: 403 });
  }

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true, code: true, userId: true } });
  if (!supplier) return NextResponse.json({ message: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const receiptCount = await prisma.goodsReceipt.count({ where: { supplierId: id } });
  if (receiptCount > 0) {
    return NextResponse.json(
      { message: `Không thể xóa — nhà cung cấp "${supplier.code}" đã có ${receiptCount} phiếu nhập hàng trong hệ thống` },
      { status: 409 }
    );
  }

  await prisma.supplier.delete({ where: { id } });
  // Xoá luôn tài khoản đăng nhập của NCC; nếu tài khoản đã có dữ liệu tham chiếu không xoá được thì khoá lại.
  if (supplier.userId) {
    const userId = supplier.userId;
    await prisma.user.delete({ where: { id: userId } }).catch(() => prisma.user.update({ where: { id: userId }, data: { isActive: false } }));
  }
  return NextResponse.json({ success: true });
}
