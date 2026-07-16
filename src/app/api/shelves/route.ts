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

// Tạo hàng loạt kệ trong 1 chữ cái hàng theo khoảng SỐ HÀNG × khoảng CỘT của 1 phòng — mã/tên/block
// tự sinh cho từng tổ hợp (VD phòng "SXA-PS", hàng "D", số hàng 1-2, cột 3-5 → 6 kệ
// "SXA-PS-D01C03".."SXA-PS-D01C05" + "SXA-PS-D02C03".."SXA-PS-D02C05", block "D01"/"D02" tương ứng).
// Số hàng nhập tay (01-99), không tự suy từ vị trí chữ cái trong bảng chữ cái — cho phép đặt VD hàng
// "D" nhưng số hàng "01"/"02" nếu kho không đánh số hàng tuần tự theo chữ cái. Bỏ qua (không lỗi) các
// mã đã tồn tại để có thể gọi lại nhiều lần khi chỉ muốn bổ sung thêm phần còn thiếu.
// assignedStaffId/sharedMotherPool/plantTypeId chỉ áp dụng cho Phòng mẫu mẹ (đúng ràng buộc như PATCH
// /api/shelves/[id]) — "kệ đã chia" gán 1 NV cấy mô cụ thể + có thể kèm mã cây (plantTypeId); "kệ chung"
// (không gán NV) phân loại thêm Kho quá hạn/đúng hạn (sharedMotherPool). assignedStaffId/sharedMotherPool
// loại trừ nhau, client tự đảm bảo không gửi cả 2 — plantTypeId gửi kèm assignedStaffId khi tạo lô "đã chia".
const lineSchema = z.object({
  row: z
    .string()
    .trim()
    .regex(/^[A-Za-z]$/, "Hàng phải là 1 chữ cái A-Z")
    .transform((v) => v.toUpperCase()),
  rowFrom: z.number().int().min(1).max(99),
  rowTo: z.number().int().min(1).max(99),
  colFrom: z.number().int().min(1),
  colTo: z.number().int().min(1),
});

// Nhận nhiều "hàng" (lines) trong 1 request duy nhất — trước đây client gọi API riêng cho từng hàng,
// khiến nếu hàng giữa chừng lỗi thì các hàng trước đã tạo thật trong DB nhưng Admin chỉ thấy 1 thông
// báo lỗi chung, tưởng chưa tạo gì. Giờ toàn bộ grid của mọi hàng được kiểm tra + tạo trong CÙNG 1
// transaction bên dưới — hoặc tạo hết, hoặc báo lỗi mà không tạo gì cả.
const createSchema = z.object({
  roomId: z.string(),
  lines: z.array(lineSchema).min(1),
  capacity: z.number().int().positive().optional(),
  assignedStaffId: z.string().optional(),
  sharedMotherPool: z.enum(["QUA_HAN", "DUNG_HAN"]).optional(),
  plantTypeId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { roomId, lines, capacity, assignedStaffId, sharedMotherPool, plantTypeId } = parsed.data;

  for (const line of lines) {
    if (line.rowFrom > line.rowTo) {
      return NextResponse.json({ message: `Hàng ${line.row}: khoảng số hàng không hợp lệ` }, { status: 400 });
    }
    if (line.colFrom > line.colTo) {
      return NextResponse.json({ message: `Hàng ${line.row}: khoảng cột không hợp lệ` }, { status: 400 });
    }
  }
  const total = lines.reduce((sum, l) => sum + (l.rowTo - l.rowFrom + 1) * (l.colTo - l.colFrom + 1), 0);
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
  if ((assignedStaffId || sharedMotherPool || plantTypeId) && room.type !== "PHONG_MAU_ME") {
    return NextResponse.json({ message: "Đã chia/Kho quá hạn-đúng hạn/Mã cây chỉ áp dụng cho Phòng mẫu mẹ" }, { status: 400 });
  }
  if ((assignedStaffId || sharedMotherPool || plantTypeId) && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được gán nhân viên/mã cây/phân loại kho cho kệ" }, { status: 403 });
  }
  if (plantTypeId) {
    const plantType = await prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { id: true } });
    if (!plantType) return NextResponse.json({ message: "Không tìm thấy loại cây" }, { status: 400 });
  }
  if (assignedStaffId) {
    const staff = await prisma.user.findUnique({ where: { id: assignedStaffId }, select: { role: true, workplaceWarehouseId: true } });
    if (!staff || staff.role !== "CAY_MO") {
      return NextResponse.json({ message: "Chỉ được gán nhân viên cấy mô (CAY_MO)" }, { status: 400 });
    }
    if (staff.workplaceWarehouseId && staff.workplaceWarehouseId !== room.warehouseId) {
      return NextResponse.json(
        { message: "Nhân viên cấy mô này đã được gán địa điểm làm việc ở kho khác — không thể gán kệ ngoài kho đó" },
        { status: 400 }
      );
    }
  }

  const gridByCode = new Map<string, { code: string; name: string; block: string; rowNumber: number; colNumber: number }>();
  for (const line of lines) {
    for (let rowNumber = line.rowFrom; rowNumber <= line.rowTo; rowNumber++) {
      const rowStr = String(rowNumber).padStart(2, "0");
      const block = `${line.row}${rowStr}`;
      for (let col = line.colFrom; col <= line.colTo; col++) {
        const colStr = String(col).padStart(2, "0");
        const code = `${room.code}-${line.row}${rowStr}C${colStr}`;
        gridByCode.set(code, { code, name: `Kệ ${line.row}${rowStr}C${colStr}`, block, rowNumber, colNumber: col });
      }
    }
  }
  const grid = [...gridByCode.values()];

  // Kiểm tra mã trùng + tạo hàng loạt trong CÙNG 1 transaction — atomic cho toàn bộ grid (mọi hàng),
  // tránh để lại dữ liệu nửa vời nếu có lỗi giữa chừng.
  const { createdCount, skippedCodes } = await prisma.$transaction(async (tx) => {
    const existing = await tx.shelf.findMany({
      where: { code: { in: grid.map((s) => s.code) } },
      select: { id: true, code: true, isActive: true },
    });
    // Kệ đã bị xóa mềm (isActive: false) vẫn chiếm mã (code là unique constraint) — không được coi là
    // "đã tồn tại" như kệ đang hoạt động, phải hồi sinh (update) đúng hàng đó thay vì bỏ qua, nếu không
    // Admin xóa kệ xong sẽ không tạo lại được kệ cùng mã (dù qua form lưới này hay Excel).
    const activeCodes = new Set(existing.filter((s) => s.isActive).map((s) => s.code));
    const inactiveIdByCode = new Map(existing.filter((s) => !s.isActive).map((s) => [s.code, s.id]));
    const toInsert = grid.filter((s) => !activeCodes.has(s.code) && !inactiveIdByCode.has(s.code));
    const toReactivate = grid.filter((s) => inactiveIdByCode.has(s.code));

    const shelfData = (s: (typeof grid)[number]) => ({
      name: s.name,
      warehouseId: room.warehouseId,
      roomId: room.id,
      rowNumber: s.rowNumber,
      colNumber: s.colNumber,
      block: s.block,
      // Cả Phòng mẫu mẹ lẫn Phòng ra rễ đều tính sức chứa theo TÚI, không có giá trị mặc định nào
      // — luôn lấy đúng số Admin cấp cao đã nhập cho từng kệ; để trống nghĩa là không giới hạn.
      capacity: capacity ?? null,
      assignedStaffId: assignedStaffId ?? null,
      sharedMotherPool: assignedStaffId ? null : (sharedMotherPool ?? null),
      plantTypeId: plantTypeId ?? null,
    });

    if (toInsert.length > 0) {
      await tx.shelf.createMany({
        data: toInsert.map((s) => ({ code: s.code, ...shelfData(s) })),
      });
    }
    for (const s of toReactivate) {
      await tx.shelf.update({
        where: { id: inactiveIdByCode.get(s.code)! },
        data: { ...shelfData(s), isActive: true, groupId: null, rotationGroupId: null, allowedCodes: [] },
      });
    }

    return {
      createdCount: toInsert.length + toReactivate.length,
      skippedCodes: grid.filter((s) => activeCodes.has(s.code)).map((s) => s.code),
    };
  });

  return NextResponse.json({ createdCount, skippedCodes }, { status: 201 });
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, "Cần chọn ít nhất 1 kệ"),
});

// Xóa hàng loạt giàn kệ — cùng quyền hạn + kiểu xóa mềm (isActive: false) như DELETE /api/shelves/[id],
// chỉ khác ở chỗ nhận 1 mảng id thay vì xóa từng kệ 1 request (xem ShelfTable — chọn nhiều kệ bằng
// checkbox rồi xóa 1 lần).
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được xóa giàn kệ" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { count } = await prisma.shelf.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true, count });
}
