import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { orchidCustomerSchema } from "@/lib/orchid/schemas";
import { upsertOrchidLogin } from "@/lib/orchid/accounts";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = orchidCustomerSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { loginEmail, loginPassword, prices, ...data } = parsed.data;

  return handleOrchidError(async () => {
    const customer = await prisma.$transaction(async (tx) => {
      const current = await tx.orchidCustomer.findUniqueOrThrow({ where: { id }, select: { userId: true } });
      // Khoá/mở tài khoản đăng nhập theo trạng thái khách.
      const userId = await upsertOrchidLogin(tx, {
        userId: current.userId,
        role: "KHACH_HANG_LAN",
        name: data.name,
        email: loginEmail,
        password: loginPassword,
        isActive: data.isActive,
      });
      if (prices) {
        await tx.orchidCustomerPrice.deleteMany({ where: { customerId: id } });
        if (prices.length) await tx.orchidCustomerPrice.createMany({ data: prices.map((p) => ({ ...p, customerId: id })) });
      }
      return tx.orchidCustomer.update({ where: { id }, data: { ...data, userId } });
    });
    return NextResponse.json(customer);
  });
}
