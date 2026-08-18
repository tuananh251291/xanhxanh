import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";
import { addDays, endOfWeek, startOfWeek, startOfDay, format } from "date-fns";
import { vi } from "date-fns/locale";

const createSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EARLY_COMPLETION"),
    expectedEndDate: z.string().min(1),
    expectedEndSession: z.enum(["SANG", "CHIEU"]),
  }),
  z.object({
    type: z.literal("OVERTIME"),
    slots: z
      .array(
        z.object({
          date: z.string().min(1),
          startTime: z.string().min(1),
          endTime: z.string().min(1),
        })
      )
      .min(1, "Cần ít nhất 1 ngày đăng ký"),
    // Bắt buộc chọn 1 trong 2 lý do — KHO_MO xem để quyết định duyệt hay không (xem ExtraWorkPurpose).
    purpose: z.enum(["COMPLETE_MAIN_INSTRUCTION", "INCREASE_OUTPUT"], { message: "Chọn lý do đăng ký làm thêm" }),
  }),
]);

// input type="date" gửi lên dạng "yyyy-MM-dd" thuần — new Date("yyyy-MM-dd") parse theo UTC (00:00 UTC),
// lệch múi giờ Việt Nam (UTC+7) khiến so sánh với các mốc tính bằng date-fns (luôn theo giờ local) bị sai
// lệch ~7 tiếng, có thể đẩy ngày hợp lệ ở biên (VD đúng Chủ nhật cuối tuần) thành "sai". Thêm giờ rõ ràng
// để Date parse theo LOCAL time thay vì UTC.
function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

const include = {
  staff: { select: { name: true, code: true } },
  instruction: { select: { code: true } },
  respondedBy: { select: { name: true } },
  slots: { orderBy: { date: "asc" as const } },
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  // Dùng khi Kho mô bàn giao 1 chỉ định cấy dự phòng (xem AssignBackupStaffCell) hoặc 1 chỉ định cấy xử
  // lý (xem AssignRepackStaffCell) và cần chọn "nhân viên đã đăng ký" — chỉ lấy đăng ký ĐÃ DUYỆT và CHƯA
  // được dùng gán cho việc nào (chung 1 cờ fulfilledAt cho cả 2 loại việc, xem schema.prisma).
  const availableToAssign = searchParams.get("availableToAssign") === "true";
  // Dùng cho bảng "Đăng ký cấy thêm" của Kho mô (ExtraWorkRequestBoard) — đăng ký đã bị từ chối không
  // còn cần theo dõi tiếp (NV đã được báo qua Alert, xem PATCH [id]/route.ts), ẩn hẳn khỏi danh sách
  // thao tác hàng ngày thay vì hiện mãi kèm badge "Từ chối". NV cấy mô xem lịch sử đăng ký của CHÍNH
  // mình (ExtraWorkRequestForm) vẫn gọi KHÔNG kèm cờ này nên vẫn thấy đủ cả đăng ký đã bị từ chối.
  const excludeRejected = searchParams.get("excludeRejected") === "true";
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  else if (excludeRejected) where.status = { not: "REJECTED" };
  if (availableToAssign) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    // Không còn giới hạn "1 NV chỉ nhận thêm đúng 1 việc/tuần" — NV cấy nhanh, hoàn thành sớm nhiều lần
    // trong cùng 1 tuần vẫn được đề xuất tiếp cho việc dự phòng/xử lý kế tiếp, không bị chặn dù đã có 1
    // đăng ký khác (fulfilledAt) trong tuần rồi. Chỉ cần đăng ký này CHƯA được dùng (fulfilledAt null).
    where.status = "APPROVED";
    where.fulfilledAt = null;
    // Chỉ đề xuất đăng ký làm thêm/hoàn thành sớm CỦA ĐÚNG TUẦN NÀY — OVERTIME vốn chỉ đăng ký được
    // trong tuần hiện tại (xem validate ở POST bên dưới) nhưng vẫn lọc lại cho chắc (phòng NV đăng ký từ
    // tuần trước còn tồn đọng chưa dùng); EARLY_COMPLETION không bị giới hạn tuần lúc đăng ký nên cần lọc
    // riêng ở đây.
    where.OR = [
      { type: "EARLY_COMPLETION", expectedEndDate: { gte: weekStart, lte: weekEnd } },
      { type: "OVERTIME", slots: { some: { date: { gte: weekStart, lte: weekEnd } } } },
    ];
  }
  if (role === "CAY_MO") {
    where.staffId = session.user.id;
  } else if (role === "KHO_MO") {
    // Kho mô chỉ thấy đăng ký của đúng NV cấy mô cùng kho sản xuất mình đang làm việc.
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.staff = { workplaceWarehouseId: session.user.workplaceWarehouseId };
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const requests = await prisma.extraWorkRequest.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") {
    return NextResponse.json({ message: "Chỉ NV cấy mô mới dùng được chức năng này" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const staffId = session.user.id;
  const today = startOfDay(new Date());

  if (parsed.data.type === "EARLY_COMPLETION") {
    const { expectedEndDate, expectedEndSession } = parsed.data;
    const date = parseLocalDate(expectedEndDate);
    if (Number.isNaN(date.getTime()) || date < today) {
      return NextResponse.json({ message: "Ngày dự kiến kết thúc không hợp lệ — không được chọn ngày đã qua" }, { status: 400 });
    }

    // Chỉ định đang thực hiện — cùng luật "1 chỉ định tại 1 thời điểm" đã áp dụng ở confirmMotherReceived
    // (đã xác nhận nhận mẫu mẹ, chưa kết thúc). KHÔNG còn chặn nếu NV đã hoàn thành hết chỉ định được
    // giao (instruction = null) — vẫn cho gửi, coi như báo "đã rảnh, sẵn sàng nhận thêm việc ngay" thay
    // vì "sắp hoàn thành 1 chỉ định cụ thể". instructionId để trống (schema đã cho phép, xem
    // ExtraWorkRequest.instructionId) — GET availableToAssign vẫn đề xuất bình thường (không lọc theo
    // instructionId), KHO_MO/Admin vẫn duyệt/từ chối được y hệt (đã tự xử lý instruction null ở nơi hiển
    // thị, xem extra-work-request-board.tsx và PATCH [id]/route.ts).
    const instruction = await prisma.plantingInstruction.findFirst({
      where: { assignedToId: staffId, motherReceivedAt: { not: null }, status: { in: ["ACTIVE", "DRAFT"] } },
      select: { id: true, code: true },
    });

    const existing = await prisma.extraWorkRequest.findFirst({
      where: { staffId, instructionId: instruction?.id ?? null, type: "EARLY_COMPLETION", status: "PENDING" },
    });
    if (existing) {
      return NextResponse.json({
        message: instruction
          ? "Bạn đã gửi thông báo hoàn thành sớm cho chỉ định này rồi — đang chờ Kho mô xác nhận"
          : "Bạn đã gửi thông báo sẵn sàng nhận thêm việc rồi — đang chờ Kho mô xác nhận",
      }, { status: 409 });
    }

    const request = await prisma.extraWorkRequest.create({
      data: { type: "EARLY_COMPLETION", staffId, instructionId: instruction?.id ?? null, expectedEndDate: date, expectedEndSession },
      include,
    });

    const sessionLabel = expectedEndSession === "SANG" ? "sáng" : "chiều";
    await createAlert({
      type: "EXTRA_WORK_REQUEST",
      title: instruction ? "NV cấy mô báo hoàn thành sớm chỉ định" : "NV cấy mô báo sẵn sàng nhận thêm việc",
      message: instruction
        ? `${session.user.name} dự kiến hoàn thành sớm chỉ định ${instruction.code} vào ${sessionLabel} ${format(date, "dd/MM/yyyy", { locale: vi })}`
        : `${session.user.name} đã hoàn thành hết chỉ định hiện có, sẵn sàng nhận thêm việc từ ${sessionLabel} ${format(date, "dd/MM/yyyy", { locale: vi })}`,
      targetRole: "KHO_MO",
      relatedId: request.id,
      relatedType: "ExtraWorkRequest",
    });

    return NextResponse.json(request, { status: 201 });
  }

  // OVERTIME — chỉ cho đăng ký từ ngày MAI đến hết Chủ nhật của TUẦN HIỆN TẠI (không cho đăng ký tuần sau
  // hay các ngày đã qua/hôm nay).
  const tomorrow = addDays(today, 1);
  const weekEnd = startOfDay(endOfWeek(new Date(), { weekStartsOn: 1 }));

  const parsedSlots = parsed.data.slots.map((s) => ({ ...s, dateObj: parseLocalDate(s.date) }));
  for (const slot of parsedSlots) {
    if (Number.isNaN(slot.dateObj.getTime()) || slot.dateObj < tomorrow || slot.dateObj > weekEnd) {
      return NextResponse.json(
        { message: `Ngày ${slot.date} không hợp lệ — chỉ được chọn từ ${format(tomorrow, "dd/MM", { locale: vi })} đến hết Chủ nhật (${format(weekEnd, "dd/MM", { locale: vi })})` },
        { status: 400 }
      );
    }
    if (slot.startTime >= slot.endTime) {
      return NextResponse.json({ message: `Giờ kết thúc phải sau giờ bắt đầu (ngày ${format(slot.dateObj, "dd/MM", { locale: vi })})` }, { status: 400 });
    }
  }

  const request = await prisma.extraWorkRequest.create({
    data: {
      type: "OVERTIME",
      staffId,
      purpose: parsed.data.purpose,
      slots: { create: parsedSlots.map((s) => ({ date: s.dateObj, startTime: s.startTime, endTime: s.endTime })) },
    },
    include,
  });

  const purposeLabel =
    parsed.data.purpose === "COMPLETE_MAIN_INSTRUCTION"
      ? "để hoàn thành chỉ định cấy chính được giao trong tuần"
      : "để gia tăng sản lượng";
  await createAlert({
    type: "EXTRA_WORK_REQUEST",
    title: "NV cấy mô đăng ký làm thêm ngoài giờ",
    message: `${session.user.name} đăng ký làm thêm ${parsedSlots.length} ngày trong tuần này (${purposeLabel}) — vào Đăng ký cấy thêm để xem chi tiết và duyệt`,
    targetRole: "KHO_MO",
    relatedId: request.id,
    relatedType: "ExtraWorkRequest",
  });

  return NextResponse.json(request, { status: 201 });
}
