import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { isAdminRole, isKhoThanhPhamRole, canEditEmploymentType, canAssignWorkplace, canManageEmploymentStatus } from "@/types";
import bcrypt from "bcryptjs";
import { z } from "zod";

const ROLES = ["ADMIN", "ADMIN_KY_THUAT", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI", "HANH_CHINH_NHAN_SU", "NHAN_VIEN_QUAN_LY_VUON"] as const;

// NV kho mô/cấy mô/môi trường/kỹ thuật bị ràng buộc làm việc với đúng 1 kho sản xuất — KY_THUAT gán được
// từ khi có nhiệm vụ tháng "Dự kiến đáp ứng cây ra rễ" (xem src/lib/rooting-forecast.ts), CHƯA dùng field
// này để giới hạn phạm vi xem Phòng tối/Phòng sáng/giàn mẫu mẹ của KY_THUAT (những nơi đó vẫn cố tình bỏ
// qua field này cho role này, giữ nguyên "xem được mọi kho" như trước). NV bán hàng (SALE) cũng dùng field
// này nhưng ràng buộc với 1 Kho THÀNH PHẨM (không phải kho sản xuất) — xem nhánh validate loại kho bên
// dưới. NV/Quản lý kho thành phẩm (isKhoThanhPhamRole) cũng gán được 1 Kho THÀNH PHẨM nhưng CHỈ mang tính
// hiển thị/lưu trữ — KHÔNG giới hạn phạm vi thao tác, họ vẫn xử lý phiếu/xem tồn trên mọi kho thành phẩm
// như trước (xem getFinishedQualifiedRooms ở src/lib/processing.ts).
const WORKPLACE_ROLES = ["KHO_MO", "CAY_MO", "MOI_TRUONG", "KY_THUAT", "SALE", "KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM", "NHAN_VIEN_SAN_XUAT"] as const;

const patchSchema = z.union([
  z.object({ status: z.literal("APPROVED"), role: z.enum(ROLES), code: z.string().min(1, "Nhập mã nhân viên") }),
  z.object({ status: z.literal("REJECTED") }),
  z.object({ workplaceWarehouseId: z.string().nullable() }),
  // true = đánh dấu "Nghỉ việc" (khoá đăng nhập ngay, giữ dữ liệu lịch sử), false = khôi phục "Đang làm
  // việc" — dùng chung 1 field isActive có sẵn (đã đúng ý nghĩa "khoá đăng nhập, không xoá dữ liệu",
  // xem DELETE bên dưới) nhưng tách hẳn khỏi nhánh "name" (sửa tài khoản đầy đủ, chỉ SUPER_ADMIN) để
  // NV Hành chính nhân sự thao tác được qua đúng 1 hành động rõ nghĩa, có xác nhận riêng ở client.
  z.object({ resign: z.boolean() }),
  z.object({ inspectionLane: z.enum(["XANH", "DO"]).nullable() }),
  z.object({ plantingCapacity: z.number().int().positive() }),
  z.object({ holdDays: z.number().int().positive().nullable() }),
  z.object({ employmentType: z.enum(["CHINH_THUC", "THU_VIEC"]).nullable() }),
  z.object({ isTrainee: z.boolean() }),
  z.object({ unlockAccount: z.literal(true) }),
  z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(ROLES),
    code: z.string().min(1, "Nhập mã nhân viên"),
    isActive: z.boolean(),
    password: z.string().min(6).optional(),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  // Địa điểm làm việc — Admin cao nhất/NV Hành chính nhân sự được gán (xem canAssignWorkplace), chỉ áp
  // dụng cho các vai trò cố định (WORKPLACE_ROLES).
  if ("workplaceWarehouseId" in parsed.data) {
    if (!canAssignWorkplace(session?.user?.role)) {
      return NextResponse.json({ message: "Chỉ Admin cao nhất/NV Hành chính nhân sự mới có quyền gán địa điểm làm việc" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (!target.role || !WORKPLACE_ROLES.includes(target.role as (typeof WORKPLACE_ROLES)[number])) {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV kho mô, cấy mô, môi trường, kỹ thuật, bán hàng, kho thành phẩm" }, { status: 400 });
    }
    const { workplaceWarehouseId } = parsed.data;
    // NV bán hàng và NV kho thành phẩm làm việc với 1 Kho THÀNH PHẨM — các vai trò còn lại vẫn là Kho
    // sản xuất như trước.
    const requiredType = target.role === "SALE" || isKhoThanhPhamRole(target.role) ? "THANH_PHAM" : "SAN_XUAT";
    if (workplaceWarehouseId) {
      const warehouse = await prisma.warehouse.findUnique({ where: { id: workplaceWarehouseId }, select: { type: true } });
      if (!warehouse || warehouse.type !== requiredType) {
        return NextResponse.json(
          { message: requiredType === "THANH_PHAM" ? "Địa điểm làm việc phải là kho thành phẩm" : "Địa điểm làm việc phải là kho sản xuất" },
          { status: 400 }
        );
      }
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { workplaceWarehouseId },
      select: { id: true, code: true, name: true, email: true, role: true, workplaceWarehouse: { select: { code: true, name: true } } },
    });

    // NV cấy mô vừa được gán kho sản xuất → tự động sinh Phòng tối cá nhân ngay (không đợi lần nhập
    // nhật ký cấy đầu tiên), để đã xuất hiện sẵn trong Kho & Giàn kệ / Phòng tối cho Admin/Kho mô xem.
    if (target.role === "CAY_MO" && workplaceWarehouseId) {
      await getOrCreatePersonalDarkRoom(id, workplaceWarehouseId);
    }

    return NextResponse.json(updated);
  }

  // "Nghỉ việc" — Admin cao nhất/NV Hành chính nhân sự đánh dấu (xem canManageEmploymentStatus). Chặn
  // đăng nhập NGAY qua isActive=false (auth.ts đã check ở cả authorize() lẫn JWT callback — có hiệu lực
  // cả với phiên đang đăng nhập, không cần đợi hết hạn token) nhưng KHÔNG xoá bất kỳ dữ liệu liên quan
  // nào (chỉ định cấy, nhật ký, đơn hàng... vẫn nguyên vẹn) — resign=false để khôi phục lại nếu cần.
  if ("resign" in parsed.data) {
    if (!canManageEmploymentStatus(session?.user?.role)) {
      return NextResponse.json({ message: "Chỉ Admin cao nhất/NV Hành chính nhân sự mới có quyền đổi trạng thái nghỉ việc" }, { status: 403 });
    }
    if (id === session?.user?.id) {
      return NextResponse.json({ message: "Không thể tự đổi trạng thái của chính mình" }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json({ message: "Không thể đổi trạng thái của tài khoản Admin cao nhất" }, { status: 403 });
    }
    const { resign } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !resign },
      select: { id: true, code: true, name: true, isActive: true },
    });
    return NextResponse.json(updated);
  }

  // Luồng kiểm tra — NV kho mô cài đặt cho đúng NV cấy mô thuộc cùng kho sản xuất mình đang làm việc.
  if ("inspectionLane" in parsed.data) {
    if (session?.user?.role !== "KHO_MO") {
      return NextResponse.json({ message: "Chỉ NV kho mô mới có quyền cài đặt luồng kiểm tra" }, { status: 403 });
    }
    if (!session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc — không thể cài đặt" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, workplaceWarehouseId: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role !== "CAY_MO") {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV cấy mô" }, { status: 400 });
    }
    if (target.workplaceWarehouseId !== session.user.workplaceWarehouseId) {
      return NextResponse.json({ message: "Chỉ được cài đặt cho NV cấy mô thuộc cùng kho sản xuất bạn đang làm việc" }, { status: 403 });
    }
    const { inspectionLane } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      data: { inspectionLane },
      select: { id: true, code: true, name: true, inspectionLane: true },
    });
    return NextResponse.json(updated);
  }

  // Năng lực cấy — số cụm mẫu mẹ 1 NV cấy mô dùng hết trong 1 tuần, chỉ ADMIN/SUPER_ADMIN cài đặt được.
  if ("plantingCapacity" in parsed.data) {
    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({ message: "Chỉ Admin/Admin cao nhất mới có quyền cài đặt năng lực cấy" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role !== "CAY_MO") {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV cấy mô" }, { status: 400 });
    }
    const { plantingCapacity } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      data: { plantingCapacity },
      select: { id: true, code: true, name: true, plantingCapacity: true },
    });
    return NextResponse.json(updated);
  }

  // Năng lực giữ đơn — số ngày giữ đơn (holdUntil = ngày tạo + số này) khi NV bán hàng "Tạm giữ đơn
  // hàng", chỉ ADMIN/SUPER_ADMIN cài đặt được. Null = chưa cấu hình, chặn không cho giữ đơn (xem POST
  // /api/orders).
  if ("holdDays" in parsed.data) {
    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({ message: "Chỉ Admin/Admin cao nhất mới có quyền cài đặt năng lực giữ đơn" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role !== "SALE") {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV bán hàng" }, { status: 400 });
    }
    const { holdDays } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      data: { holdDays },
      select: { id: true, code: true, name: true, holdDays: true },
    });
    return NextResponse.json(updated);
  }

  // Loại hợp đồng (Chính thức/Thử việc) — chỉ áp dụng NV cấy mô, chỉ Admin cấp cao/NV Hành chính nhân
  // sự cài đặt được (KHÔNG bao gồm Admin thường, khác plantingCapacity).
  if ("employmentType" in parsed.data) {
    if (!canEditEmploymentType(session?.user?.role)) {
      return NextResponse.json({ message: "Chỉ Admin cấp cao/NV Hành chính nhân sự mới có quyền cài đặt loại hợp đồng" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role !== "CAY_MO") {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV cấy mô" }, { status: 400 });
    }
    const { employmentType } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      // Lên "Chính thức" thì tự gỡ luôn "Cấy học việc" — 1 NV Chính thức không còn thuộc nhóm học việc
      // theo đúng trình tự nghiệp vụ (Thử việc + học việc → Thử việc → Chính thức).
      data: { employmentType, ...(employmentType === "CHINH_THUC" ? { isTrainee: false } : {}) },
      select: { id: true, code: true, name: true, employmentType: true, isTrainee: true },
    });
    return NextResponse.json(updated);
  }

  // "Cấy học việc" — chỉ áp dụng NV cấy mô, cùng quyền với Loại hợp đồng (Admin cấp cao/NV Hành chính
  // nhân sự). NV thường rời nhóm này (tắt) trước khi được chuyển "Chính thức" — không ràng buộc cứng thứ
  // tự, HR vẫn tự quyết theo thực tế.
  if ("isTrainee" in parsed.data) {
    if (!canEditEmploymentType(session?.user?.role)) {
      return NextResponse.json({ message: "Chỉ Admin cấp cao/NV Hành chính nhân sự mới có quyền cài đặt trạng thái cấy học việc" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role !== "CAY_MO") {
      return NextResponse.json({ message: "Chỉ áp dụng cho NV cấy mô" }, { status: 400 });
    }
    const { isTrainee } = parsed.data;
    const updated = await prisma.user.update({
      where: { id },
      data: { isTrainee },
      select: { id: true, code: true, name: true, isTrainee: true },
    });
    return NextResponse.json(updated);
  }

  // Mở khóa tài khoản bị khóa do đăng nhập sai quá 5 lần — chỉ Admin cao nhất, reset luôn bộ đếm.
  if ("unlockAccount" in parsed.data) {
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền mở khóa tài khoản" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id }, select: { lockedAt: true } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    const updated = await prisma.user.update({
      where: { id },
      data: { lockedAt: null, failedLoginAttempts: 0 },
      select: { id: true, code: true, name: true, lockedAt: true },
    });
    return NextResponse.json(updated);
  }

  // Sửa thông tin chung tài khoản (tên/email/vai trò/kích hoạt/đổi mật khẩu) — chỉ Admin cao nhất.
  if ("name" in parsed.data) {
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền sửa tài khoản" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json({ message: "Không thể sửa tài khoản Admin cao nhất qua đây" }, { status: 403 });
    }

    const { name, email, role, code, isActive, password } = parsed.data;
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.id !== id) {
      return NextResponse.json({ message: "Email đã được dùng bởi tài khoản khác" }, { status: 409 });
    }
    const codeOwner = await prisma.user.findUnique({ where: { code } });
    if (codeOwner && codeOwner.id !== id) {
      return NextResponse.json({ message: "Mã nhân viên đã được dùng cho tài khoản khác" }, { status: 409 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role,
        code,
        isActive,
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
      select: { id: true, code: true, name: true, email: true, role: true, isActive: true },
    });
    return NextResponse.json(updated);
  }

  // Chỉ Admin cao nhất (SUPER_ADMIN) được duyệt/từ chối tài khoản mới — Admin thường không có quyền này.
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền duyệt tài khoản" }, { status: 403 });
  }

  // Vai trò + mã nhân viên chỉ được chọn/nhập lúc duyệt, thay cho mã tạm "TEMPxxxx" gán lúc đăng ký.
  // Admin nhập tay mã cố định (VD theo danh sách nhân sự có sẵn) thay vì hệ thống tự sinh, để không bị
  // lệch với mã đã cấp sẵn từ trước ở nơi khác.
  if ("role" in parsed.data) {
    const codeOwner = await prisma.user.findUnique({ where: { code: parsed.data.code } });
    if (codeOwner && codeOwner.id !== id) {
      return NextResponse.json({ message: "Mã nhân viên đã được dùng cho tài khoản khác" }, { status: 409 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, code: true, name: true, email: true, role: true, status: true },
  });

  return NextResponse.json(user);
}

// Xóa cứng — chỉ Admin cao nhất, và chỉ khi tài khoản CHƯA có bất kỳ dữ liệu liên quan nào (chỉ định
// cấy đã tạo/được gán, nhật ký cấy, đơn hàng, phiếu bàn giao, đề xuất...) — User bị tham chiếu ở rất
// nhiều bảng (~30 quan hệ, xem model User trong schema.prisma), xóa khi đã có lịch sử sẽ phá vỡ dữ liệu
// liên quan. Tài khoản có lịch sử thì dùng nút "Ngừng hoạt động" (isActive=false, xem nhánh "name" ở
// PATCH trên) thay vì xóa — chỉ xóa được tài khoản tạo nhầm/đăng ký chưa từng dùng.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới có quyền xóa tài khoản" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ message: "Không thể tự xóa tài khoản đang đăng nhập" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      role: true,
      _count: {
        select: {
          plantingInstructions: true,
          assignedInstructions: true,
          handedOverInstructions: true,
          contaminationProposalsRequested: true,
          contaminationProposalsApproved: true,
          dailyRecords: true,
          transfersFrom: true,
          transfersTo: true,
          orders: true,
          alerts: true,
          roomAccess: true,
          assignedShelves: true,
          assignedRooms: true,
          mediumOrdersConfirmed: true,
          mediumOrderDaysConfirmed: true,
          checklistItems: true,
          lotInspections: true,
          inspectedLots: true,
          transferInspectionsPerformed: true,
          materialIntakes: true,
          processingTickets: true,
          orderProcessingRequestsCompleted: true,
          goodsReceipts: true,
          goodsReceiptsConfirmed: true,
          goodsReceiptItemsReturned: true,
          extraWorkRequests: true,
          extraWorkRequestsResponded: true,
          productPrices: true,
          repackCreated: true,
          repackAssignedTo: true,
          repackAssignedBy: true,
          repackInspectedBy: true,
          repackPlacedBy: true,
          repackQuantityIssueReportedBy: true,
        },
      },
    },
  });
  if (!target) return NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 });
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ message: "Không thể xóa tài khoản Admin cao nhất" }, { status: 403 });
  }

  const relatedCount = Object.values(target._count).reduce((sum, n) => sum + n, 0);
  if (relatedCount > 0) {
    return NextResponse.json(
      {
        message: `Không thể xóa — tài khoản "${target.code} — ${target.name}" đã có ${relatedCount.toLocaleString("vi-VN")} mục dữ liệu liên quan trong hệ thống (chỉ định cấy, nhật ký, đơn hàng...). Hãy dùng nút "Ngừng hoạt động" thay vì xóa.`,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    // Phòng khi có quan hệ nào đó bị bỏ sót khỏi danh sách _count trên (VD schema thêm bảng mới sau
    // này) — Postgres vẫn chặn đúng bằng ràng buộc khóa ngoại, chỉ cần trả thông báo thân thiện thay vì
    // lỗi 500 thô.
    return NextResponse.json(
      { message: `Không thể xóa — tài khoản "${target.code} — ${target.name}" vẫn còn dữ liệu liên quan trong hệ thống.` },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
