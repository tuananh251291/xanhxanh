import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadContaminationProposalPhoto, deleteContaminationProposalPhoto } from "@/lib/contamination-proposal-storage";
import { MAX_DATA_URL_LENGTH } from "@/lib/contamination-proposal-constants";
import { z } from "zod";

const photoField = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh không hợp lệ")
  .refine((v) => v.length <= MAX_DATA_URL_LENGTH, "Ảnh quá lớn, vui lòng chụp lại");

const postSchema = z.object({ dataUrl: photoField });

// Tải 1 ảnh bằng chứng lên TRƯỚC khi ContaminationProposal được tạo (chỉ Đối tác vận hành — xem
// de-xuat-execute-form.tsx, phiếu chỉ thực sự sinh ra lúc bấm "Tạo phiếu đề xuất", ảnh phải đính sẵn trên
// form trước đó) — path keyed theo user + thời điểm, không gắn theo proposalId.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "DOI_TAC_VAN_HANH") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const url = await uploadContaminationProposalPhoto(parsed.data.dataUrl, path);
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tải ảnh lên thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}

const deleteSchema = z.object({ url: z.string() });

// Gỡ 1 ảnh lỡ đính nhầm TRƯỚC khi bấm "Tạo phiếu đề xuất" (ảnh chưa gắn vào phiếu nào) — chỉ xoá khỏi
// Supabase Storage, không đụng DB (không có bản ghi nào tham chiếu URL này ở giai đoạn này).
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "DOI_TAC_VAN_HANH") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  await deleteContaminationProposalPhoto(parsed.data.url).catch(() => {});
  return NextResponse.json({ success: true });
}
