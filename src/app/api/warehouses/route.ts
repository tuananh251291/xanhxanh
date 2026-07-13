import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateWarehouseCode } from "@/lib/codes";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["SAN_XUAT", "THANH_PHAM"]),
  description: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, ...(type ? { type: type as "SAN_XUAT" | "THANH_PHAM" } : {}) },
    include: {
      rooms: {
        where: { isActive: true },
        orderBy: { type: "asc" },
        include: {
          shelves: {
            where: { isActive: true },
            include: {
              group: { select: { id: true, name: true } },
              rotationGroup: { select: { id: true, name: true } },
              plantType: { select: { code: true, transferWaitWeeks: true } },
            },
          },
        },
      },
      shelves: { where: { isActive: true, roomId: null } },
    },
    orderBy: { type: "asc" },
  });
  return NextResponse.json(warehouses);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const code = await generateWarehouseCode(parsed.data.type);
  const warehouse = await prisma.warehouse.create({ data: { ...parsed.data, code } });

  // Kho sản xuất mới mặc định có cấu tạo giống các kho sản xuất hiện tại — tự tạo sẵn 3 phòng (Phòng
  // mẫu mẹ, Phòng ra rễ, Phòng nhiễm), CHƯA tạo giàn kệ (Admin tự thêm số lượng phù hợp qua "Thêm giàn
  // kệ" ở từng phòng, không cố định 1 kích cỡ). Phòng tối cá nhân không tạo ở đây — tự sinh riêng theo
  // từng NV cấy mô khi được gán làm việc tại kho này (xem lib/dark-room.ts).
  if (parsed.data.type === "SAN_XUAT") {
    await prisma.room.createMany({
      data: [
        { code: `${code}-PS`, name: "Phòng mẫu mẹ", type: "PHONG_MAU_ME", warehouseId: warehouse.id },
        { code: `${code}-PRR`, name: "Phòng ra rễ", type: "PHONG_RA_RE", warehouseId: warehouse.id },
        { code: `${code}-NHIEM`, name: "Phòng nhiễm", type: "PHONG_NHIEM", warehouseId: warehouse.id },
      ],
    });
  }

  // Kho thành phẩm mới mặc định có cấu tạo giống Kho thành phẩm A hiện tại — tự tạo sẵn 3 phòng cố định
  // (Phòng khả dụng, Phòng theo dõi, Phòng hàn túi); phòng thị trường không tạo sẵn, Admin tự thêm sau
  // qua "Thêm phòng thị trường" (xem add-market-room-dialog.tsx).
  if (parsed.data.type === "THANH_PHAM") {
    await prisma.room.createMany({
      data: [
        { code: `${code}-KD`, name: "Phòng khả dụng", type: "PHONG_KHA_DUNG", warehouseId: warehouse.id },
        { code: `${code}-TD`, name: "Phòng theo dõi", type: "PHONG_THEO_DOI", warehouseId: warehouse.id },
        { code: `${code}-HT`, name: "Phòng hàn túi", type: "PHONG_HAN_TUI", warehouseId: warehouse.id },
      ],
    });
  }

  return NextResponse.json(warehouse, { status: 201 });
}
