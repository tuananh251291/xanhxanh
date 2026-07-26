import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSystemConfig } from "@/lib/inventory";
import { isoWeekStringToMonday } from "@/lib/week-rotation";
import { ROOTING_ROTATION_START_WEEK_KEY } from "@/lib/rooting-week-group";
import { MOTHER_ROTATION_START_WEEK_KEY } from "@/lib/mother-week-group";
import { z } from "zod";

// "Tuần khởi đầu của Nhóm 1" (Nhóm tuần ra rễ hoặc Nhóm tuần mẫu mẹ, phân biệt bằng "kind") — chỉ
// SUPER_ADMIN mới xem/sửa được, giống hệt mức quyền của /api/shelf-groups (khác ADMIN thường) vì đây là
// cấu hình chung cho cơ chế xoay vòng, không riêng 1 kho/phòng nào (xem getCurrentWeekSlot ở
// src/lib/week-rotation.ts).
const kindSchema = z.enum(["RA_RE", "MAU_ME"]);
const KEY_BY_KIND = { RA_RE: ROOTING_ROTATION_START_WEEK_KEY, MAU_ME: MOTHER_ROTATION_START_WEEK_KEY } as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const kindParsed = kindSchema.safeParse(new URL(req.url).searchParams.get("kind"));
  if (!kindParsed.success) return NextResponse.json({ message: "Thiếu hoặc sai tham số kind" }, { status: 400 });

  const startWeek = await getSystemConfig(KEY_BY_KIND[kindParsed.data], "");
  return NextResponse.json({ startWeek: startWeek || null });
}

const patchSchema = z.object({
  kind: kindSchema,
  // Định dạng input type="week": "YYYY-Www" (VD "2026-W27").
  startWeek: z.string().regex(/^\d{4}-W\d{2}$/, "Định dạng tuần không hợp lệ"),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  if (!isoWeekStringToMonday(parsed.data.startWeek)) {
    return NextResponse.json({ message: "Tuần không hợp lệ" }, { status: 400 });
  }

  const key = KEY_BY_KIND[parsed.data.kind];
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: parsed.data.startWeek },
    create: {
      key,
      value: parsed.data.startWeek,
      description:
        parsed.data.kind === "RA_RE"
          ? "Tuần khởi đầu (ISO 8601) của Nhóm tuần ra rễ 1 — các Nhóm 2/3/4 tự tính tuần tiếp theo, xoay vòng liên tục qua các năm"
          : "Tuần khởi đầu (ISO 8601) của Nhóm tuần mẫu mẹ 1 — các Nhóm tiếp theo tự tính tuần kế tiếp, xoay vòng liên tục qua các năm",
    },
  });

  return NextResponse.json({ startWeek: parsed.data.startWeek });
}
