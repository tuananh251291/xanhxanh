import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry, parseDateVN } from "@/lib/orchid/server";
import { orchidPointSchema } from "@/lib/orchid/schemas";
import { upsertOrchidLogin } from "@/lib/orchid/accounts";

export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidPointSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { loginEmail, loginPassword, startDate, ...data } = parsed.data;
  return handleOrchidError(async () => {
    const point = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const userId = await upsertOrchidLogin(tx, { userId: null, role: "DIEM_BAN_LAN", name: data.name, email: loginEmail, password: loginPassword });
        return tx.orchidRetailPoint.create({
          data: { ...data, code: await ORCHID_CODE.point(tx), startDate: startDate ? parseDateVN(startDate) : null, userId },
        });
      })
    );
    return NextResponse.json(point, { status: 201 });
  });
}
