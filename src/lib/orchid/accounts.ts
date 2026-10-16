import bcrypt from "bcryptjs";
import type { Prisma, UserRole } from "@prisma/client";
import { generateUserCode } from "@/lib/codes";
import { OrchidError } from "@/lib/orchid/server";

// Tạo/cập nhật tài khoản đăng nhập cho Khách hàng lan / Điểm bán lẻ lan. Tài khoản tạo bởi Admin hoa lan/
// Trợ lý hoa lan nên duyệt sẵn (APPROVED), không qua hàng chờ duyệt tài khoản nhân viên.
export async function upsertOrchidLogin(
  tx: Prisma.TransactionClient,
  params: { userId: string | null; role: Extract<UserRole, "KHACH_HANG_LAN" | "DIEM_BAN_LAN">; name: string; email?: string | null; password?: string | null; isActive?: boolean }
): Promise<string | null> {
  const { userId, role, name } = params;
  const email = params.email?.trim().toLowerCase() || null;
  const password = params.password?.trim() || null;

  if (userId) {
    const data: Prisma.UserUpdateInput = { name };
    if (email) data.email = email;
    if (password) {
      data.password = await bcrypt.hash(password, 10);
      data.failedLoginAttempts = 0;
      data.lockedAt = null;
    }
    if (params.isActive !== undefined) data.isActive = params.isActive;
    await tx.user.update({ where: { id: userId }, data });
    return userId;
  }

  if (!email) return null;
  if (!password || password.length < 6) throw new OrchidError("Mật khẩu đăng nhập tối thiểu 6 ký tự");
  const existed = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (existed) throw new OrchidError(`Email ${email} đã được dùng cho tài khoản khác`);

  let code = await generateUserCode(role);
  // generateUserCode đọc ngoài transaction — tránh trùng khi có tài khoản cùng tiền tố vừa tạo.
  while (await tx.user.findUnique({ where: { code }, select: { id: true } })) {
    const prefix = code.replace(/\d+$/, "");
    const seq = parseInt(code.slice(prefix.length), 10) + 1;
    code = `${prefix}${String(seq).padStart(code.length - prefix.length, "0")}`;
  }
  const user = await tx.user.create({
    data: { code, name, email, password: await bcrypt.hash(password, 10), role, status: "APPROVED" },
    select: { id: true },
  });
  return user.id;
}
