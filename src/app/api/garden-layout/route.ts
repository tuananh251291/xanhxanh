import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { z } from "zod";

const MAX_ROWS_PER_ADD = 50;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Sơ đồ bố trí 1 vườn: Nhà lưới → Giàn kệ → Dãy (mã vị trí VD "1A1", xem model GardenHouse).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const gardenId = new URL(req.url).searchParams.get("gardenId");
  if (!gardenId) return NextResponse.json({ message: "Thiếu vườn" }, { status: 400 });
  if (!(await canManageGarden(session.user, gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const houses = await prisma.gardenHouse.findMany({
    where: { gardenId },
    orderBy: { number: "asc" },
    select: {
      id: true, number: true,
      racks: { orderBy: { letter: "asc" }, select: { id: true, letter: true, rows: { orderBy: { number: "asc" }, select: { id: true, number: true } } } },
    },
  });
  return NextResponse.json(houses);
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addHouse"), gardenId: z.string().min(1) }),
  z.object({ action: z.literal("addRack"), houseId: z.string().min(1) }),
  z.object({ action: z.literal("addRows"), rackId: z.string().min(1), count: z.number().int().min(1).max(MAX_ROWS_PER_ADD) }),
]);

// Thêm phần tử tiếp theo — số/chữ luôn = lớn nhất hiện có + 1 (nhà lưới 1,2,3… / giàn A,B,C… / dãy 1,2,3…).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  try {
    if (data.action === "addHouse") {
      if (!(await canManageGarden(session.user, data.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
      const last = await prisma.gardenHouse.findFirst({ where: { gardenId: data.gardenId }, orderBy: { number: "desc" }, select: { number: true } });
      const house = await prisma.gardenHouse.create({ data: { gardenId: data.gardenId, number: (last?.number ?? 0) + 1 }, select: { number: true } });
      return NextResponse.json({ message: `Đã thêm Nhà lưới ${house.number}` }, { status: 201 });
    }

    if (data.action === "addRack") {
      const house = await prisma.gardenHouse.findUnique({ where: { id: data.houseId }, select: { gardenId: true, number: true, racks: { select: { letter: true } } } });
      if (!house) return NextResponse.json({ message: "Không tìm thấy nhà lưới" }, { status: 404 });
      if (!(await canManageGarden(session.user, house.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
      const maxIdx = house.racks.reduce((m, r) => Math.max(m, LETTERS.indexOf(r.letter)), -1);
      if (maxIdx + 1 >= LETTERS.length) return NextResponse.json({ message: "Nhà lưới đã đủ 26 giàn (A–Z)" }, { status: 400 });
      const letter = LETTERS[maxIdx + 1];
      await prisma.gardenRack.create({ data: { houseId: data.houseId, letter } });
      return NextResponse.json({ message: `Đã thêm giàn ${house.number}${letter}` }, { status: 201 });
    }

    const rack = await prisma.gardenRack.findUnique({
      where: { id: data.rackId },
      select: { letter: true, house: { select: { gardenId: true, number: true } }, rows: { orderBy: { number: "desc" }, take: 1, select: { number: true } } },
    });
    if (!rack) return NextResponse.json({ message: "Không tìm thấy giàn" }, { status: 404 });
    if (!(await canManageGarden(session.user, rack.house.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    const start = (rack.rows[0]?.number ?? 0) + 1;
    await prisma.gardenRow.createMany({ data: Array.from({ length: data.count }, (_, i) => ({ rackId: data.rackId, number: start + i })) });
    const prefix = `${rack.house.number}${rack.letter}`;
    const end = start + data.count - 1;
    return NextResponse.json({ message: data.count === 1 ? `Đã thêm dãy ${prefix}${start}` : `Đã thêm dãy ${prefix}${start} – ${prefix}${end}` }, { status: 201 });
  } catch (err) {
    // 2 người bấm thêm cùng lúc → trùng số/chữ (unique) — báo tải lại thay vì lỗi 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ message: "Vừa có người khác thêm cùng lúc — tải lại trang rồi thử lại" }, { status: 409 });
    }
    throw err;
  }
}

const deleteSchema = z.object({ type: z.enum(["house", "rack", "row"]), id: z.string().min(1) });

// Vị trí đang có cây (dòng tồn vườn ở bất kỳ kho nào, GardenStockLine) thì không cho xoá — điều chuyển cây đi trước.
async function hasPlants(where: { rowId?: string; rackId?: string; houseId?: string }) {
  const count = await prisma.gardenStockLine.count({
    where: {
      quantity: { gt: 0 },
      row: where.rowId ? { id: where.rowId } : where.rackId ? { rackId: where.rackId } : { rack: { houseId: where.houseId } },
    },
  });
  return count > 0;
}
const HAS_PLANTS_MESSAGE = "Vị trí đang có cây — điều chuyển cây sang dãy khác (Chăm sóc cây mô / Điều phối tồn vườn) trước khi xoá";

// Chỉ xoá được phần tử CUỐI (số/chữ lớn nhất) để dãy số/chữ luôn liên tục — xoá nhà lưới/giàn xoá luôn mọi
// giàn/dãy bên trong (onDelete Cascade).
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { type, id } = parsed.data;

  if (type === "house") {
    const house = await prisma.gardenHouse.findUnique({ where: { id }, select: { gardenId: true, number: true } });
    if (!house) return NextResponse.json({ message: "Không tìm thấy nhà lưới" }, { status: 404 });
    if (!(await canManageGarden(session.user, house.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    const last = await prisma.gardenHouse.findFirst({ where: { gardenId: house.gardenId }, orderBy: { number: "desc" }, select: { id: true } });
    if (last?.id !== id) return NextResponse.json({ message: "Chỉ xoá được nhà lưới có số lớn nhất" }, { status: 400 });
    if (await hasPlants({ houseId: id })) return NextResponse.json({ message: HAS_PLANTS_MESSAGE }, { status: 400 });
    await prisma.gardenHouse.delete({ where: { id } });
    return NextResponse.json({ message: `Đã xoá Nhà lưới ${house.number}` });
  }

  if (type === "rack") {
    const rack = await prisma.gardenRack.findUnique({ where: { id }, select: { houseId: true, letter: true, house: { select: { gardenId: true, number: true, racks: { select: { id: true, letter: true } } } } } });
    if (!rack) return NextResponse.json({ message: "Không tìm thấy giàn" }, { status: 404 });
    if (!(await canManageGarden(session.user, rack.house.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    const last = [...rack.house.racks].sort((a, b) => LETTERS.indexOf(b.letter) - LETTERS.indexOf(a.letter))[0];
    if (last?.id !== id) return NextResponse.json({ message: "Chỉ xoá được giàn cuối cùng của nhà lưới" }, { status: 400 });
    if (await hasPlants({ rackId: id })) return NextResponse.json({ message: HAS_PLANTS_MESSAGE }, { status: 400 });
    await prisma.gardenRack.delete({ where: { id } });
    return NextResponse.json({ message: `Đã xoá giàn ${rack.house.number}${rack.letter}` });
  }

  const row = await prisma.gardenRow.findUnique({ where: { id }, select: { rackId: true, number: true, rack: { select: { letter: true, house: { select: { gardenId: true, number: true } } } } } });
  if (!row) return NextResponse.json({ message: "Không tìm thấy dãy" }, { status: 404 });
  if (!(await canManageGarden(session.user, row.rack.house.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const last = await prisma.gardenRow.findFirst({ where: { rackId: row.rackId }, orderBy: { number: "desc" }, select: { id: true } });
  if (last?.id !== id) return NextResponse.json({ message: "Chỉ xoá được dãy cuối cùng của giàn" }, { status: 400 });
  if (await hasPlants({ rowId: id })) return NextResponse.json({ message: HAS_PLANTS_MESSAGE }, { status: 400 });
  await prisma.gardenRow.delete({ where: { id } });
  return NextResponse.json({ message: `Đã xoá dãy ${row.rack.house.number}${row.rack.letter}${row.number}` });
}
