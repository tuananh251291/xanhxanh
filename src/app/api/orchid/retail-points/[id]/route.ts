import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, parseDateVN } from "@/lib/orchid/server";
import { orchidPointSchema } from "@/lib/orchid/schemas";
import { upsertOrchidLogin } from "@/lib/orchid/accounts";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = orchidPointSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { loginEmail, loginPassword, startDate, ...data } = parsed.data;
  return handleOrchidError(async () => {
    const point = await prisma.$transaction(async (tx) => {
      const current = await tx.orchidRetailPoint.findUniqueOrThrow({ where: { id }, select: { userId: true } });
      // Điểm bán đã đóng thì khoá luôn tài khoản đăng nhập.
      const userId = await upsertOrchidLogin(tx, {
        userId: current.userId,
        role: "DIEM_BAN_LAN",
        name: data.name,
        email: loginEmail,
        password: loginPassword,
        isActive: data.status !== "CLOSED",
      });
      return tx.orchidRetailPoint.update({ where: { id }, data: { ...data, startDate: startDate ? parseDateVN(startDate) : null, userId } });
    });
    return NextResponse.json(point);
  });
}
