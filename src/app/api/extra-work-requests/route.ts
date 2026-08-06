import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";
import { addDays, endOfWeek, startOfDay, format } from "date-fns";
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
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (availableToAssign) {
    where.status = "APPROVED";
    where.fulfilledAt = null;
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
    // (đã xác nhận nhận mẫu mẹ, chưa kết thúc).
    const instruction = await prisma.plantingInstruction.findFirst({
      where: { assignedToId: staffId, motherReceivedAt: { not: null }, status: { in: ["ACTIVE", "DRAFT"] } },
      select: { id: true, code: true },
    });
    if (!instruction) {
      return NextResponse.json({ message: "Bạn không có chỉ định nào đang thực hiện để báo hoàn thành sớm" }, { status: 400 });
    }

    const existing = await prisma.extraWorkRequest.findFirst({
      where: { staffId, instructionId: instruction.id, type: "EARLY_COMPLETION", status: "PENDING" },
    });
    if (existing) {
      return NextResponse.json({ message: "Bạn đã gửi thông báo hoàn thành sớm cho chỉ định này rồi — đang chờ Kho mô xác nhận" }, { status: 409 });
    }

    const request = await prisma.extraWorkRequest.create({
      data: { type: "EARLY_COMPLETION", staffId, instructionId: instruction.id, expectedEndDate: date, expectedEndSession },
      include,
    });

    const sessionLabel = expectedEndSession === "SANG" ? "sáng" : "chiều";
    await createAlert({
      type: "EXTRA_WORK_REQUEST",
      title: "NV cấy mô báo hoàn thành sớm chỉ định",
      message: `${session.user.name} dự kiến hoàn thành sớm chỉ định ${instruction.code} vào ${sessionLabel} ${format(date, "dd/MM/yyyy", { locale: vi })}`,
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
      slots: { create: parsedSlots.map((s) => ({ date: s.dateObj, startTime: s.startTime, endTime: s.endTime })) },
    },
    include,
  });

  await createAlert({
    type: "EXTRA_WORK_REQUEST",
    title: "NV cấy mô đăng ký làm thêm ngoài giờ",
    message: `${session.user.name} đăng ký làm thêm ${parsedSlots.length} ngày trong tuần này — vào Đăng ký cấy thêm để xem chi tiết và duyệt`,
    targetRole: "KHO_MO",
    relatedId: request.id,
    relatedType: "ExtraWorkRequest",
  });

  return NextResponse.json(request, { status: 201 });
}
