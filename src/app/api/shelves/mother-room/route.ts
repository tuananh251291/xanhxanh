import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";

const PAGE_SIZE = 10;

// Danh sách giàn kệ Phòng mẫu mẹ theo trang + tìm kiếm nhanh — tách riêng khỏi GET /inventory/kho-sang
// (trước đây tải nguyên khối cả phòng, có phòng tới 600+ kệ kèm lô từng kệ khiến trang tải ~9 giây).
// Trả về 10 kệ/trang, tìm theo mã kệ/tên kệ/mã cây/tên NV phụ trách chứa ký tự gõ vào (không phân biệt
// hoa thường) — dùng chung cho cả 2 bảng "Đã chia"/"Chung" của cùng 1 phòng (phân biệt qua assigned=).
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/kho-sang"))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  const assigned = searchParams.get("assigned") === "true";
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  if (!roomId) return NextResponse.json({ message: "Thiếu roomId" }, { status: 400 });

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, type: true, warehouseId: true } });
  if (!room || room.type !== "PHONG_MAU_ME") {
    return NextResponse.json({ message: "Không tìm thấy Phòng mẫu mẹ" }, { status: 404 });
  }
  // NV kho mô chỉ xem được đúng 1 kho sản xuất đã được gán — NV kỹ thuật không giới hạn.
  const workplaceWarehouseId = role !== "KY_THUAT" ? session?.user?.workplaceWarehouseId : null;
  if (workplaceWarehouseId && room.warehouseId !== workplaceWarehouseId) {
    return NextResponse.json({ message: "Không có quyền xem kho này" }, { status: 403 });
  }

  const where = {
    roomId,
    isActive: true,
    assignedStaffId: assigned ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { plantType: { name: { contains: q, mode: "insensitive" as const } } },
            { assignedStaff: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [total, shelves] = await Promise.all([
    prisma.shelf.count({ where }),
    prisma.shelf.findMany({
      where,
      include: {
        plantType: { select: { code: true, name: true } },
        assignedStaff: { select: { name: true } },
        lots: {
          where: { status: "ACTIVE", stageCode: "M05" },
          select: { quantity: true, plantType: { select: { code: true, name: true } } },
        },
      },
      orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const items = shelves.map((s) => {
    // Kệ chung (assigned=false) không gán cố định 1 mã cây (plantType null) nên có thể đang xếp lẫn
    // NHIỀU mã cây khác nhau cùng lúc — gộp thẳng m05Quantity/plantTypeName như trước sẽ mù mờ không biết
    // của mã nào. Tách riêng theo từng mã cây thật sự đang có trên kệ (breakdown) để trang gọi API tự
    // quyết định tách thành nhiều dòng hiển thị (xem MotherShelfTable) — kệ đã chia vẫn chỉ có đúng 1 mã
    // cây nên breakdown ở đó luôn có tối đa 1 phần tử, không đổi hành vi hiển thị.
    const byPlantType = new Map<string, { plantTypeCode: string; plantTypeName: string; quantity: number }>();
    // Bỏ qua lô đã về 0 cụm — lô còn "ACTIVE" trong DB nhưng số lượng thật đã hết thì không còn được
    // coi là "đang xếp trên kệ" nữa, mã cây phải biến mất khỏi breakdown theo đúng số lượng thật.
    for (const l of s.lots) {
      if (l.quantity === 0) continue;
      const entry = byPlantType.get(l.plantType.code) ?? { plantTypeCode: l.plantType.code, plantTypeName: l.plantType.name, quantity: 0 };
      entry.quantity += l.quantity;
      byPlantType.set(l.plantType.code, entry);
    }
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      plantTypeCode: s.plantType?.code ?? null,
      plantTypeName: s.plantType?.name ?? null,
      assignedStaffName: s.assignedStaff?.name ?? null,
      m05Quantity: s.lots.reduce((sum, l) => sum + l.quantity, 0),
      breakdown: Array.from(byPlantType.values()).sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode)),
    };
  });

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
}
