import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry } from "@/lib/orchid/server";
import { orchidCustomerSchema } from "@/lib/orchid/schemas";
import { upsertOrchidLogin } from "@/lib/orchid/accounts";

// Admin cấp cao/NV Trợ lý tạo khách hàng lan — kèm tài khoản đăng nhập (role KHACH_HANG_LAN) nếu nhập email.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidCustomerSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { loginEmail, loginPassword, prices, ...data } = parsed.data;

  return handleOrchidError(async () => {
    const customer = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const userId = await upsertOrchidLogin(tx, { userId: null, role: "KHACH_HANG_LAN", name: data.name, email: loginEmail, password: loginPassword });
        return tx.orchidCustomer.create({
          data: {
            ...data,
            code: await ORCHID_CODE.customer(tx),
            userId,
            createdById: guard.user.id,
            prices: prices?.length ? { create: prices } : undefined,
          },
        });
      })
    );
    return NextResponse.json(customer, { status: 201 });
  });
}
