import { prisma } from "@/lib/prisma";
import type Anthropic from "@anthropic-ai/sdk";

// Bộ công cụ (tool) cho "Trợ lý AI" (xem src/app/api/ai-assistant/route.ts) — CHỈ đọc dữ liệu, không có
// tool nào ghi/sửa. Giai đoạn 1 chỉ mở cho SUPER_ADMIN/ADMIN_KY_THUAT (2 vai trò thấy được toàn bộ dữ
// liệu qua isAdminRole) nên các tool dưới đây KHÔNG lọc phạm vi theo user — mở rộng cho vai trò khác sau
// này thì PHẢI thêm điều kiện lọc đúng theo vai trò đó (giống các route /api/* hiện có), không được để
// model tự quyết định phạm vi.

export const AI_ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "tra_cuu_ton_kho",
    description:
      "Tra cứu tồn kho thực tế (số lượng lô đang hoạt động, đã lọc bỏ lô hết hàng) theo mã cây và/hoặc mã kho và/hoặc giai đoạn (mẫu mẹ MAU_ME hoặc thành phẩm THANH_PHAM). Bỏ trống tham số nào thì không lọc theo tiêu chí đó. Trả về danh sách gộp theo (mã cây, kho, giai đoạn).",
    input_schema: {
      type: "object",
      properties: {
        plantTypeCode: { type: "string", description: "Mã cây hoặc 1 phần mã cây, VD 'PD' hoặc 'PD001'. Bỏ trống = mọi mã cây." },
        warehouseCode: { type: "string", description: "Mã kho, VD 'KD01'. Bỏ trống = mọi kho." },
        stage: { type: "string", enum: ["MAU_ME", "THANH_PHAM"], description: "Giai đoạn cây. Bỏ trống = cả 2 giai đoạn." },
      },
    },
  },
  {
    name: "tra_cuu_don_hang",
    description:
      "Tra cứu đơn hàng theo trạng thái, mã khách hàng, hoặc mã đơn cụ thể. Trả về số lượng đơn theo từng trạng thái trong phạm vi lọc, kèm tối đa 20 đơn gần nhất khớp bộ lọc.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "HELD", "CONFIRMED", "SHIPPED", "CANCELLED"], description: "Trạng thái đơn. Bỏ trống = mọi trạng thái." },
        customerCode: { type: "string", description: "Mã khách hàng hoặc 1 phần mã. Bỏ trống = mọi khách hàng." },
        orderCode: { type: "string", description: "Mã đơn cụ thể hoặc 1 phần mã, dùng khi cần tra 1 đơn." },
        days: { type: "number", description: "Chỉ lấy đơn tạo trong N ngày gần nhất. Mặc định 30 ngày." },
      },
    },
  },
  {
    name: "tra_cuu_canh_bao",
    description: "Tra cứu các cảnh báo (Alert) gần đây trong hệ thống — dùng khi được hỏi có cảnh báo/vấn đề gì đang cần xử lý.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["UNREAD", "READ"], description: "Trạng thái cảnh báo. Bỏ trống = mọi trạng thái." },
        limit: { type: "number", description: "Số lượng tối đa trả về, mặc định 20, tối đa 50." },
      },
    },
  },
  {
    name: "tra_cuu_chi_dinh_cay",
    description:
      "Tra cứu chỉ định cấy (PlantingInstruction) theo trạng thái, mã cây, NV cấy mô được giao, hoặc tuần thực hiện. Trả về mã chỉ định, mã cây, NV, trạng thái, số mẫu mẹ đầu vào, sản lượng dự kiến mẫu mẹ/thành phẩm.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED", "ENDED"], description: "Trạng thái chỉ định. Bỏ trống = mọi trạng thái." },
        plantTypeCode: { type: "string", description: "Mã cây hoặc 1 phần mã cây. Bỏ trống = mọi mã cây." },
        staffCode: { type: "string", description: "Mã NV cấy mô được giao (assignedTo) hoặc 1 phần mã. Bỏ trống = mọi NV." },
        days: { type: "number", description: "Chỉ lấy chỉ định có tuần thực hiện (weekStart) trong N ngày gần nhất. Mặc định 30 ngày." },
      },
    },
  },
  {
    name: "tra_cuu_ty_le_nhiem",
    description:
      "Tra cứu số lượng cây nhiễm và tỉ lệ nhiễm (tự phát hiện lúc NV cấy mô kiểm tra phòng tối) theo NV cấy mô, gộp theo khu sản xuất (kho) của từng NV. Dùng khi được hỏi về tình hình nhiễm theo khu sản xuất hoặc theo nhân sự.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất (kho) của NV, hoặc 1 phần mã. Bỏ trống = mọi khu sản xuất." },
        staffCode: { type: "string", description: "Mã NV cấy mô hoặc 1 phần mã. Bỏ trống = mọi NV." },
        days: { type: "number", description: "Khoảng thời gian tính bằng ngày gần nhất. Mặc định 30 ngày." },
      },
    },
  },
  {
    name: "tra_cuu_du_kien_san_luong",
    description:
      "Tra cứu dự kiến sản lượng (KY_THUAT nộp theo lộ trình 3 tháng/lần) — chọn loại mẫu mẹ (MAU_ME) hoặc thành phẩm ra rễ (THANH_PHAM). Trả về từng dòng dự kiến kèm 3 tháng kế tiếp (taskMonth+1/+2/+3) và số lượng dự kiến từng tháng, theo khu sản xuất/mã cây/NV phụ trách.",
    input_schema: {
      type: "object",
      properties: {
        loai: { type: "string", enum: ["MAU_ME", "THANH_PHAM"], description: "Loại dự kiến sản lượng cần tra — bắt buộc." },
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất." },
        plantTypeCode: { type: "string", description: "Mã cây. Bỏ trống = mọi mã cây." },
        staffCode: { type: "string", description: "Mã NV Kỹ thuật/cấy mô phụ trách. Bỏ trống = mọi NV." },
      },
      required: ["loai"],
    },
  },
];

type ToolResult = { content: string; is_error?: boolean };

function fmtQty(n: number): string {
  return n.toLocaleString("vi-VN");
}

async function runTraCuuTonKho(input: { plantTypeCode?: string; warehouseCode?: string; stage?: "MAU_ME" | "THANH_PHAM" }): Promise<ToolResult> {
  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      quantity: { gt: 0 },
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.plantTypeCode ? { plantType: { code: { contains: input.plantTypeCode, mode: "insensitive" } } } : {}),
    },
    select: {
      quantity: true,
      stage: true,
      plantType: { select: { code: true, name: true } },
      shelf: { select: { warehouse: { select: { code: true, name: true } } } },
      room: { select: { warehouse: { select: { code: true, name: true } } } },
    },
    take: 3000,
  });

  type Group = { plantTypeCode: string; plantTypeName: string; warehouseCode: string; warehouseName: string; stage: string; totalQuantity: number; lotCount: number };
  const groups = new Map<string, Group>();
  for (const lot of lots) {
    const warehouse = lot.shelf?.warehouse ?? lot.room?.warehouse;
    if (!warehouse) continue;
    if (input.warehouseCode && !warehouse.code.toLowerCase().includes(input.warehouseCode.toLowerCase())) continue;
    const key = `${lot.plantType.code}::${warehouse.code}::${lot.stage}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalQuantity += lot.quantity;
      existing.lotCount += 1;
    } else {
      groups.set(key, {
        plantTypeCode: lot.plantType.code,
        plantTypeName: lot.plantType.name,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        stage: lot.stage,
        totalQuantity: lot.quantity,
        lotCount: 1,
      });
    }
  }

  const rows = Array.from(groups.values()).sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 100);
  if (rows.length === 0) return { content: "Không tìm thấy tồn kho nào khớp bộ lọc." };
  const lines = rows.map(
    (r) => `${r.plantTypeCode} (${r.plantTypeName}) tại kho ${r.warehouseCode} (${r.warehouseName}), giai đoạn ${r.stage}: ${fmtQty(r.totalQuantity)} cây, ${r.lotCount} lô`
  );
  return { content: lines.join("\n") };
}

async function runTraCuuDonHang(input: { status?: string; customerCode?: string; orderCode?: string; days?: number }): Promise<ToolResult> {
  const days = Math.min(Math.max(input.days ?? 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000);

  const where = {
    createdAt: { gte: since },
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.customerCode ? { customerCode: { contains: input.customerCode, mode: "insensitive" as const } } : {}),
    ...(input.orderCode ? { code: { contains: input.orderCode, mode: "insensitive" as const } } : {}),
  };

  const [statusCounts, orders] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { code: true, customerCode: true, status: true, market: true, createdAt: true, sale: { select: { name: true } } },
    }),
  ]);

  if (orders.length === 0) return { content: `Không tìm thấy đơn hàng nào khớp bộ lọc trong ${days} ngày gần nhất.` };

  const summary = statusCounts.map((s) => `${s.status}: ${s._count._all}`).join(", ");
  const lines = orders.map(
    (o) => `${o.code} · KH ${o.customerCode} · ${o.status} · ${o.market} · Sale ${o.sale.name} · ${o.createdAt.toISOString().slice(0, 10)}`
  );
  return { content: `Tổng theo trạng thái (trong ${days} ngày): ${summary}\n\nDanh sách gần nhất:\n${lines.join("\n")}` };
}

async function runTraCuuCanhBao(input: { status?: "UNREAD" | "READ"; limit?: number }): Promise<ToolResult> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const alerts = await prisma.alert.findMany({
    where: input.status ? { status: input.status } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { title: true, message: true, type: true, status: true, createdAt: true },
  });
  if (alerts.length === 0) return { content: "Không có cảnh báo nào khớp bộ lọc." };
  const lines = alerts.map((a) => `[${a.status}] ${a.title} — ${a.message} (${a.type}, ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")})`);
  return { content: lines.join("\n") };
}

async function runTraCuuChiDinhCay(input: { status?: string; plantTypeCode?: string; staffCode?: string; days?: number }): Promise<ToolResult> {
  const days = Math.min(Math.max(input.days ?? 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000);

  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      weekStart: { gte: since },
      ...(input.status ? { status: input.status as never } : {}),
      ...(input.plantTypeCode ? { plantType: { code: { contains: input.plantTypeCode, mode: "insensitive" } } } : {}),
      ...(input.staffCode ? { assignedTo: { code: { contains: input.staffCode, mode: "insensitive" } } } : {}),
    },
    orderBy: { weekStart: "desc" },
    take: 30,
    select: {
      code: true,
      status: true,
      weekStart: true,
      inputMotherQuantity: true,
      expectedMotherOutput: true,
      expectedFinishedOutput: true,
      plantType: { select: { code: true, name: true } },
      assignedTo: { select: { code: true, name: true } },
    },
  });

  if (instructions.length === 0) return { content: `Không tìm thấy chỉ định cấy nào khớp bộ lọc trong ${days} ngày gần nhất.` };
  const lines = instructions.map(
    (ins) =>
      `${ins.code} · ${ins.plantType.code} (${ins.plantType.name}) · NV ${ins.assignedTo ? `${ins.assignedTo.name} (${ins.assignedTo.code})` : "chưa gán"} · ${ins.status} · tuần ${ins.weekStart ? ins.weekStart.toISOString().slice(0, 10) : "chưa đặt"} · MM đầu vào ${fmtQty(ins.inputMotherQuantity)} · dự kiến MM ${ins.expectedMotherOutput != null ? fmtQty(ins.expectedMotherOutput) : "—"} · dự kiến TP ${ins.expectedFinishedOutput != null ? fmtQty(ins.expectedFinishedOutput) : "—"}`
  );
  return { content: lines.join("\n") };
}

async function runTraCuuTyLeNhiem(input: { warehouseCode?: string; staffCode?: string; days?: number }): Promise<ToolResult> {
  const days = Math.min(Math.max(input.days ?? 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000);

  const inspections = await prisma.lotInspection.findMany({
    where: {
      createdAt: { gte: since },
      ...(input.staffCode ? { staff: { code: { contains: input.staffCode, mode: "insensitive" } } } : {}),
      ...(input.warehouseCode ? { staff: { workplaceWarehouse: { code: { contains: input.warehouseCode, mode: "insensitive" } } } } : {}),
    },
    select: {
      staffId: true,
      staff: { select: { code: true, name: true, workplaceWarehouse: { select: { code: true, name: true } } } },
      items: { select: { initialQuantity: true, contaminatedQuantity: true } },
    },
  });

  if (inspections.length === 0) return { content: `Không có dữ liệu kiểm tra nhiễm nào khớp bộ lọc trong ${days} ngày gần nhất.` };

  type Group = { staffCode: string; staffName: string; warehouseCode: string; warehouseName: string; totalCreated: number; totalContaminated: number };
  const groups = new Map<string, Group>();
  for (const insp of inspections) {
    const warehouse = insp.staff.workplaceWarehouse;
    const key = insp.staffId;
    const existing = groups.get(key) ?? {
      staffCode: insp.staff.code,
      staffName: insp.staff.name,
      warehouseCode: warehouse?.code ?? "—",
      warehouseName: warehouse?.name ?? "Chưa gán khu sản xuất",
      totalCreated: 0,
      totalContaminated: 0,
    };
    for (const item of insp.items) {
      existing.totalCreated += item.initialQuantity;
      existing.totalContaminated += item.contaminatedQuantity;
    }
    groups.set(key, existing);
  }

  const rows = Array.from(groups.values())
    .map((g) => ({ ...g, ratePct: g.totalCreated > 0 ? Math.round((g.totalContaminated / g.totalCreated) * 1000) / 10 : 0 }))
    .sort((a, b) => b.ratePct - a.ratePct)
    .slice(0, 50);

  const lines = rows.map(
    (r) => `${r.staffName} (${r.staffCode}) · khu sản xuất ${r.warehouseCode} (${r.warehouseName}): ${fmtQty(r.totalContaminated)}/${fmtQty(r.totalCreated)} cây nhiễm (${r.ratePct}%)`
  );
  return { content: `Tỉ lệ nhiễm tự phát hiện trong ${days} ngày gần nhất (không tính luồng Đỏ kiểm tra lại lúc bàn giao):\n${lines.join("\n")}` };
}

async function runTraCuuDuKienSanLuong(input: { loai: "MAU_ME" | "THANH_PHAM"; warehouseCode?: string; plantTypeCode?: string; staffCode?: string }): Promise<ToolResult> {
  const where = {
    ...(input.warehouseCode ? { warehouse: { code: { contains: input.warehouseCode, mode: "insensitive" as const } } } : {}),
    ...(input.plantTypeCode ? { plantType: { code: { contains: input.plantTypeCode, mode: "insensitive" as const } } } : {}),
    ...(input.staffCode ? { assignedStaff: { code: { contains: input.staffCode, mode: "insensitive" as const } } } : {}),
  };

  const select = {
    taskMonth: true,
    quantity1: true,
    quantity2: true,
    quantity3: true,
    warehouse: { select: { code: true, name: true } },
    plantType: { select: { code: true, name: true } },
    assignedStaff: { select: { code: true, name: true } },
  } as const;

  const entries =
    input.loai === "MAU_ME"
      ? await prisma.motherForecastEntry.findMany({ where, orderBy: { taskMonth: "desc" }, take: 50, select })
      : await prisma.rootingForecastEntry.findMany({ where, orderBy: { taskMonth: "desc" }, take: 50, select });

  if (entries.length === 0) return { content: "Không tìm thấy dự kiến sản lượng nào khớp bộ lọc." };

  const addMonths = (d: Date, n: number) => {
    const r = new Date(d);
    r.setMonth(r.getMonth() + n);
    return r.toISOString().slice(0, 7);
  };
  const lines = entries.map((e) => {
    const m1 = addMonths(e.taskMonth, 1);
    const m2 = addMonths(e.taskMonth, 2);
    const m3 = addMonths(e.taskMonth, 3);
    return `${e.plantType.code} (${e.plantType.name}) · khu ${e.warehouse.code} · NV ${e.assignedStaff.name} (${e.assignedStaff.code}): ${m1}=${fmtQty(e.quantity1)}, ${m2}=${fmtQty(e.quantity2)}, ${m3}=${fmtQty(e.quantity3)}`;
  });
  return { content: `Dự kiến sản lượng ${input.loai === "MAU_ME" ? "mẫu mẹ" : "thành phẩm ra rễ"} (mỗi dòng là 1 lộ trình 3 tháng nộp gần nhất):\n${lines.join("\n")}` };
}

export async function runAiAssistantTool(name: string, rawInput: unknown): Promise<ToolResult> {
  try {
    const input = (rawInput ?? {}) as Record<string, unknown>;
    switch (name) {
      case "tra_cuu_ton_kho":
        return await runTraCuuTonKho(input as never);
      case "tra_cuu_don_hang":
        return await runTraCuuDonHang(input as never);
      case "tra_cuu_canh_bao":
        return await runTraCuuCanhBao(input as never);
      case "tra_cuu_chi_dinh_cay":
        return await runTraCuuChiDinhCay(input as never);
      case "tra_cuu_ty_le_nhiem":
        return await runTraCuuTyLeNhiem(input as never);
      case "tra_cuu_du_kien_san_luong":
        return await runTraCuuDuKienSanLuong(input as never);
      default:
        return { content: `Không có công cụ tên "${name}"`, is_error: true };
    }
  } catch {
    return { content: "Có lỗi khi truy vấn dữ liệu cho công cụ này.", is_error: true };
  }
}

// Kiến thức nền "hướng dẫn thao tác" — tóm tắt luồng vận hành + cấu trúc vai trò, cho phép trợ lý trả lời
// trực tiếp các câu hỏi "làm sao để..." mà không cần gọi tool. Giữ NGẮN GỌN để tiết kiệm token mỗi lượt
// hỏi (đây là phần cố định trong system prompt, đã bật cache_control ở route.ts).
export const AI_ASSISTANT_GUIDE = `
Luồng vận hành chính của hệ thống Xanh Xanh (ERP nuôi cấy mô):
Kỹ thuật tạo chỉ định cấy (từ mẫu mẹ có sẵn trên kệ) → Kho mô bàn giao mẫu mẹ cho NV cấy mô → NV cấy mô
nhập dữ liệu cấy hàng ngày (tạo lô mới) → bàn giao lô vào phòng tối (7 ngày) → Kho mô xác nhận nhận, kiểm
tra nhiễm, chuyển lên kệ kho sáng → sau 4-6 tuần: mẫu mẹ cấy lại, thành phẩm chuyển kho thành phẩm → Kho
thành phẩm phân loại đạt/không đạt → Sale tạo đơn giữ (HELD) → xác nhận (CONFIRMED) → Kho thành phẩm xuất
hàng (SHIPPED).

Mã cây mới tạo trong "Quản lý loại cây" CHƯA có tồn kho — phải "Nhận hàng" (nhập lô mẫu mẹ đầu tiên) thì
mới chọn được khi tạo chỉ định cấy.

Vai trò chính: KY_THUAT (tạo chỉ định cấy, theo dõi khu sản xuất), KHO_MO (bàn giao/nhận mẫu mẹ, kiểm tra
nhiễm), CAY_MO (nhập dữ liệu cấy hàng ngày), KHO_THANH_PHAM (nhận/phân loại/xuất kho thành phẩm), SALE
(tạo và theo dõi đơn hàng), HANH_CHINH_NHAN_SU (quản lý nhân sự, lương), DOI_TAC_VAN_HANH (đối tác vận
hành kho thị trường). ADMIN/SUPER_ADMIN/ADMIN_KY_THUAT quản trị toàn hệ thống.
`.trim();
