import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

// Tra cứu 1 giàn kệ theo mã (dùng khi quét QR code của kệ — QR chỉ mã hoá đúng shelf.code, xem
// components/shared/qr-code-display.tsx). Trả về kèm lô thành phẩm đang active để trang "Bàn giao
// thành phẩm" tổng hợp số lượng theo loại cây — không tự chặn theo loại phòng ở đây, để UI tự quyết
// định thông báo lỗi phù hợp (VD: "kệ này không thuộc Phòng ra rễ").
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ message: "Thiếu mã giàn kệ" }, { status: 400 });

  const shelf = await prisma.shelf.findUnique({
    where: { code },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      room: { select: { id: true, type: true, name: true } },
      lots: {
        where: { status: "ACTIVE", stage: "THANH_PHAM" },
        select: { id: true, code: true, quantity: true, stageCode: true, plantType: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  if (!shelf) return NextResponse.json({ message: `Không tìm thấy giàn kệ có mã "${code}"` }, { status: 404 });

  return NextResponse.json(shelf);
}

const MAX_SHELVES_PER_REQUEST = 300;

// Tạo hàng loạt kệ trong 1 hàng (chữ cái) theo khoảng cột của 1 phòng — mã/tên/block tự sinh
// (VD phòng "SXA-PS", hàng A cột 1-5 → "SXA-PS-A01C01"..."SXA-PS-A01C05", tên "Kệ A01C05", block
// "A01"). Không còn tiền tố "R" như trước — hàng hiển thị bằng chữ cái + quy đổi số 2 chữ số liền
// sau (A=01, B=02...) để mã kệ luôn đủ độ rộng cố định, dễ sắp xếp. Bỏ qua (không lỗi) các mã đã
// tồn tại để có thể gọi lại nhiều lần khi chỉ muốn bổ sung thêm phần cột còn thiếu.
const createSchema = z.object({
  roomId: z.string(),
  row: z
    .string()
    .trim()
    .regex(/^[A-Za-z]$/, "Hàng phải là 1 chữ cái A-Z")
    .transform((v) => v.toUpperCase()),
  colFrom: z.number().int().min(1),
  colTo: z.number().int().min(1),
  capacity: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { roomId, row, colFrom, colTo, capacity } = parsed.data;
  // rowNumber (Int trong DB) chỉ dùng để sắp xếp/nhóm — quy đổi trực tiếp từ chữ cái (A=1, B=2...).
  const rowNumber = row.charCodeAt(0) - 64;
  const rowStr = String(rowNumber).padStart(2, "0");

  if (colFrom > colTo) {
    return NextResponse.json({ message: "Khoảng cột không hợp lệ" }, { status: 400 });
  }
  const total = colTo - colFrom + 1;
  if (total > MAX_SHELVES_PER_REQUEST) {
    return NextResponse.json({ message: `Chỉ tạo tối đa ${MAX_SHELVES_PER_REQUEST} kệ mỗi lần` }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, code: true, warehouseId: true, type: true },
  });
  if (!room) return NextResponse.json({ message: "Không tìm thấy phòng" }, { status: 404 });
  if (room.type !== "PHONG_MAU_ME" && room.type !== "PHONG_RA_RE") {
    return NextResponse.json({ message: "Chỉ Phòng mẫu mẹ/Phòng ra rễ mới quản lý theo giàn kệ" }, { status: 400 });
  }

  const grid: { code: string; name: string; block: string; rowNumber: number; colNumber: number }[] = [];
  const block = `${row}${rowStr}`;
  for (let col = colFrom; col <= colTo; col++) {
    const colStr = String(col).padStart(2, "0");
    grid.push({ code: `${room.code}-${row}${rowStr}C${colStr}`, name: `Kệ ${row}${rowStr}C${colStr}`, block, rowNumber, colNumber: col });
  }

  const existing = await prisma.shelf.findMany({
    where: { code: { in: grid.map((s) => s.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((s) => s.code));
  const toInsert = grid.filter((s) => !existingCodes.has(s.code));

  if (toInsert.length > 0) {
    await prisma.shelf.createMany({
      data: toInsert.map((s) => ({
        code: s.code,
        name: s.name,
        warehouseId: room.warehouseId,
        roomId: room.id,
        rowNumber: s.rowNumber,
        colNumber: s.colNumber,
        block: s.block,
        // Phòng mẫu mẹ: sức chứa tính theo cụm mẫu mẹ, mặc định 1800 nếu không nhập. Phòng ra rễ: sức
        // chứa tính theo túi thành phẩm (T01/T05), không bắt buộc — để trống nghĩa là không giới hạn.
        capacity: room.type === "PHONG_MAU_ME" ? (capacity ?? 1800) : (capacity ?? null),
      })),
    });
  }

  return NextResponse.json(
    {
      createdCount: toInsert.length,
      skippedCodes: grid.filter((s) => existingCodes.has(s.code)).map((s) => s.code),
    },
    { status: 201 }
  );
}
