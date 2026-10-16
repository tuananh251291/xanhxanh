import { NextRequest, NextResponse } from "next/server";
import { requireOrchidPoint, badRequest } from "@/lib/orchid/server";
import { orchidPhotoSchema, uploadOrchidPhoto } from "@/lib/orchid/storage";

// Ảnh cây hỏng tại điểm bán.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidPoint();
  if ("error" in guard) return guard.error;
  const parsed = orchidPhotoSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Ảnh không hợp lệ");
  try {
    const url = await uploadOrchidPhoto(parsed.data.dataUrl, `damages/${guard.point.id}`);
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Tải ảnh lên thất bại" }, { status: 500 });
  }
}
