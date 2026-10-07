import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

const schema = z.object({
  stage: z.string().max(50),
  message: z.string().max(300),
});

// Lỗi phía điện thoại khi chấm công (GPS bị chặn, camera không mở...) — các lỗi này không bao giờ tới
// /api/attendance/check nên ghi riêng vào log server (pm2 logs) để tra cứu NV bị kẹt ở bước nào.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  console.warn(`[attendance-client] ${session.user.name ?? session.user.id} (${session.user.role}) stage=${parsed.data.stage} — ${parsed.data.message}`);
  return NextResponse.json({ ok: true });
}
