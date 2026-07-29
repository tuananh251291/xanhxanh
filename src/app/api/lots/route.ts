import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const roomType = searchParams.get("roomType");
  const roomId = searchParams.get("roomId");
  const warehouseId = searchParams.get("warehouseId");
  const shelfId = searchParams.get("shelfId");
  const rotationGroupId = searchParams.get("rotationGroupId");
  const status = searchParams.get("status") ?? "ACTIVE";
  const instructionId = searchParams.get("instructionId");
  const assignedToId = searchParams.get("assignedToId");
  const availableForInstruction = searchParams.get("availableForInstruction") === "true";
  // Dùng khi tạo chỉ định cấy DỰ PHÒNG (create-instruction-dialog.tsx, backupMode) — chỉ lấy lô trên kệ
  // "chung" chưa chia (Shelf.assignedStaffId null), không lấy kệ đã chia của 1 NV cụ thể.
  const unassignedShelfOnly = searchParams.get("unassignedShelfOnly") === "true";

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (status) where.status = status;
  if (instructionId) where.instructionId = instructionId;
  // Dùng cho dropdown chọn quy cách nguồn lúc tạo chỉ định cấy (xem create-instruction-dialog.tsx) —
  // ẩn lô mẫu mẹ đang là nguồn của 1 chỉ định CHƯA kết thúc (ACTIVE/DRAFT), tránh 2 chỉ định cùng lúc
  // dùng chung 1 lô mẫu mẹ làm nguồn (chồng lấn phân bổ). Chỉ định đã ENDED/CANCELLED/COMPLETED thì lô
  // lại hiện ra bình thường cho vòng cấy chuyển tiếp theo (VD: đến hạn cấy lại theo expectedMoveAt).
  if (availableForInstruction) {
    where.instructionItems = { none: { instruction: { status: { in: ["ACTIVE", "DRAFT"] } } } };
  }

  if (rotationGroupId) {
    // Lấy TẤT CẢ lô mẫu mẹ trên mọi kệ cùng 1 Nhóm tuần mẫu mẹ (rotationGroupId) — dùng khi KY_THUAT chọn
    // 1 kệ để ra chỉ định cấy: các kệ cùng Nhóm coi như 1 đợt, gộp chung vào 1 chỉ định (xem
    // create-instruction-dialog.tsx). Lọc CHÍNH XÁC theo Nhóm thay vì dựa vào danh sách chung (take: 200
    // theo enteredAt desc bên dưới), tránh lô của kệ khác trong Nhóm bị rớt khỏi 200 lô mới nhất.
    where.shelf = { rotationGroupId };
  } else if (shelfId) {
    // Lối tắt "Tạo chỉ định" từ 1 kệ cụ thể (banner Nhóm tuần mẫu mẹ đến hạn) — lọc CHÍNH XÁC đúng kệ
    // đó thay vì dựa vào danh sách chung (take: 200 theo enteredAt desc bên dưới), tránh trường hợp lô
    // của kệ đã đến hạn (nhập kho từ lâu) bị rớt khỏi 200 lô mới nhất và dialog không tự chọn được kệ.
    where.shelfId = shelfId;
  } else if (roomId) {
    // Kho thành phẩm không quản lý theo giàn kệ — lô gắn thẳng vào phòng (roomId trực tiếp trên Lot).
    // Kho sản xuất vẫn gắn qua kệ (shelf.roomId).
    where.OR = [{ roomId }, { shelf: { roomId } }];
  } else if (warehouseId) {
    where.shelf = { warehouseId };
  } else if (roomType === "PHONG_TOI") {
    // Phòng tối cá nhân giờ là 1 Room riêng/NV — Lot gắn thẳng vào Room đó (roomId), không qua kệ.
    where.room = { type: "PHONG_TOI" };
    // Lô đã có phiếu bàn giao PENDING (đang chờ KHO_MO xác nhận) thì ẩn khỏi cả trang kiểm tra nhiễm
    // lẫn trang bàn giao — lô vẫn nằm vật lý ở phòng tối (status/roomId chưa đổi) cho tới lúc KHO_MO
    // xác nhận, nên nếu không lọc thì F5 lại trang bàn giao vẫn thấy lô đó và có thể bàn giao trùng lần 2.
    where.transferItems = { none: { transfer: { status: "PENDING" } } };
  } else if (roomType) {
    where.shelf = { room: { type: roomType }, ...(unassignedShelfOnly ? { assignedStaffId: null } : {}) };
  }

  if (assignedToId) {
    where.instruction = { assignedToId };
  }

  // CAY_MO can only see their own lots (from their instructions)
  const role = session.user.role;
  if (role === "CAY_MO" && !assignedToId) {
    where.instruction = { assignedToId: session.user.id };
  }

  const lots = await prisma.lot.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true, category: { select: { code: true, name: true } } } },
      shelf: {
        include: {
          warehouse: { select: { name: true, type: true } },
          room: { select: { name: true, type: true } },
          rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
        },
      },
      room: {
        select: { name: true, type: true, warehouse: { select: { name: true } } },
      },
      instruction: { select: { code: true, assignedToId: true, assignedTo: { select: { id: true, name: true } } } },
      _count: { select: { contaminations: true, instructionItems: true } },
    },
    orderBy: { enteredAt: "desc" },
    take: 200,
  });

  return NextResponse.json(lots);
}
