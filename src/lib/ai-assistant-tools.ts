import { prisma } from "@/lib/prisma";
import type Anthropic from "@anthropic-ai/sdk";
import { startOfWeek, subWeeks, subMonths, startOfMonth } from "date-fns";
import { computeInspectionDefectReport } from "@/lib/inspection-defect-report";
import { computeProductionRecordForPeriod } from "@/lib/production-record-report";
import { computeMotherStockGrowth } from "@/lib/mother-stock-growth-report";
import { isNearExpiry } from "@/lib/report-utils";

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
  {
    name: "tra_cuu_ke_hoach_vs_thuc_te_chi_dinh",
    description:
      "So sánh kỳ vọng lúc tạo chỉ định cấy (sản lượng mẫu mẹ/thành phẩm dự kiến) với số liệu thực tế NV cấy mô đã cấy ra (nhật ký cấy), theo từng chỉ định. Dùng khi được hỏi 1 chỉ định cụ thể có đạt kỳ vọng không.",
    input_schema: {
      type: "object",
      properties: {
        plantTypeCode: { type: "string", description: "Mã cây hoặc 1 phần mã. Bỏ trống = mọi mã cây." },
        instructionCode: { type: "string", description: "Mã chỉ định cụ thể hoặc 1 phần mã. Bỏ trống = mọi chỉ định." },
        days: { type: "number", description: "Chỉ lấy chỉ định tạo trong N ngày gần nhất. Mặc định 60 ngày." },
      },
    },
  },
  {
    name: "tra_cuu_ke_hoach_vs_thuc_te_ra_re",
    description:
      "So sánh kế hoạch dự kiến sản lượng thành phẩm ra rễ (KY_THUAT nộp theo lộ trình 3 tháng) với sản lượng thành phẩm thực tế đã cấy ra, gộp theo khu sản xuất và theo NV+mã cây. Dùng khi được hỏi có đạt kế hoạch/chỉ tiêu ra rễ không.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = toàn hệ thống." },
        months: { type: "number", description: "Số tháng gần nhất cần so sánh, mặc định 3." },
      },
    },
  },
  {
    name: "tra_cuu_nhat_ky_cay",
    description:
      "Tra cứu tổng hợp nhật ký cấy (mẫu mẹ sử dụng, cấy ra mẫu mẹ, cấy ra thành phẩm) theo NV cấy mô, trong 1 tuần hoặc 1 tháng cụ thể.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["week", "month"], description: "Xem theo tuần (Thứ 2 - Chủ nhật) hay theo tháng lịch. Mặc định 'week'." },
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất." },
        staffCode: { type: "string", description: "Mã NV cấy mô. Bỏ trống = mọi NV." },
      },
    },
  },
  {
    name: "tra_cuu_san_luong_ghi_nhan",
    description:
      "Tra cứu sản lượng ĐƯỢC GHI NHẬN (tính KPI/lương, đã trừ hàng không đạt/nhiễm) của NV cấy mô trong 1 khoảng ngày, theo khu sản xuất. Dùng khi được hỏi về sản lượng thực tế/hiệu suất NV.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất." },
        dateFrom: { type: "string", description: "Ngày bắt đầu yyyy-MM-dd. Bỏ trống = đầu tháng hiện tại." },
        dateTo: { type: "string", description: "Ngày kết thúc yyyy-MM-dd. Bỏ trống = hôm nay hoặc cuối tháng hiện tại." },
      },
    },
  },
  {
    name: "tra_cuu_nang_luc_san_xuat",
    description:
      "Tra cứu nhanh xu hướng năng lực sản xuất gần đây (sản lượng mẫu mẹ/thành phẩm cấy ra mỗi tuần trong 4 tuần gần nhất) theo mã cây và khu sản xuất — bản tóm tắt đơn giản, KHÔNG phải mô phỏng dự báo đầy đủ như trang Năng lực sản xuất.",
    input_schema: {
      type: "object",
      properties: {
        plantTypeCode: { type: "string", description: "Mã cây — bắt buộc." },
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = toàn hệ thống." },
      },
      required: ["plantTypeCode"],
    },
  },
  {
    name: "tra_cuu_mau_me_gia_tang",
    description: "Tra cứu sản lượng mẫu mẹ gia tăng thực sự trong khoảng tuần gần đây, theo mã cây, gộp theo khu sản xuất.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất (chạy lần lượt từng khu)." },
        weeksBack: { type: "number", description: "Số tuần gần nhất cần tính gia tăng, mặc định 4." },
      },
    },
  },
  {
    name: "tra_cuu_danh_gia_chat_luong_ra_re",
    description: "Tra cứu kết quả đánh giá chất lượng cây ra rễ hàng tuần (tỉ lệ đạt/không đạt) do NV Kỹ thuật đã hoàn thành, theo khu sản xuất.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất." },
        limit: { type: "number", description: "Số lượt đánh giá gần nhất, mặc định 20, tối đa 50." },
      },
    },
  },
  {
    name: "tra_cuu_luong_kiem_tra",
    description:
      "Tra cứu NV cấy mô đang thuộc luồng kiểm tra Xanh/Vàng/Đỏ (Vàng/Đỏ phải kiểm tra lại lúc bàn giao, Xanh được tin tưởng không kiểm tra lại), gộp theo khu sản xuất.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất." },
        lane: { type: "string", enum: ["XANH", "VANG", "DO"], description: "Chỉ lấy đúng 1 luồng. Bỏ trống = mọi luồng." },
      },
    },
  },
  {
    name: "tra_cuu_phieu_khong_dat_nhiem",
    description: "Tra cứu các phiếu kiểm tra bàn giao có ghi nhận hàng không đạt hoặc nhiễm, theo NV, trong 1 tháng cụ thể.",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Tháng cần tra, dạng yyyy-MM. Bỏ trống = tháng hiện tại." },
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = mọi khu sản xuất." },
      },
    },
  },
  {
    name: "tra_cuu_lech_chi_dinh",
    description:
      "Tra cứu các lần NV cấy mô cấy lệch chỉ định quá ngưỡng, kèm nguyên nhân NV Kỹ thuật đã kết luận (do kỹ thuật ra chỉ định sai, do NV cấy sai, hoặc vượt chỉ tiêu) — và NV nào tái phạm từ 2 lần trở lên trong 30 ngày gần đây.",
    input_schema: {
      type: "object",
      properties: {
        cause: { type: "string", enum: ["UNRESOLVED", "KY_THUAT_SAI", "CAY_MO_SAI", "CAY_MO_VUOT_CHI_TIEU"], description: "Nguyên nhân. Bỏ trống = mọi nguyên nhân." },
        staffCode: { type: "string", description: "Mã NV cấy mô. Bỏ trống = mọi NV." },
        month: { type: "string", description: "Tháng cần tra, dạng yyyy-MM. Bỏ trống = mọi thời điểm." },
      },
    },
  },
  {
    name: "tra_cuu_nhap_xuat",
    description:
      "Tra cứu tổng hợp Nhập (từ nhà cung cấp) - Xuất (đơn hàng, chuyển nội bộ kho thành phẩm, trồng/hủy) của kho thành phẩm trong 1 khoảng ngày.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã kho thành phẩm. Bỏ trống = toàn hệ thống." },
        dateFrom: { type: "string", description: "Ngày bắt đầu yyyy-MM-dd. Bỏ trống = đầu tháng hiện tại." },
        dateTo: { type: "string", description: "Ngày kết thúc yyyy-MM-dd. Bỏ trống = hôm nay." },
      },
    },
  },
  {
    name: "tra_cuu_ton_kho_qua_han",
    description:
      "Tra cứu các lô sắp/đã quá hạn chuyển giai đoạn (mẫu mẹ đến hạn cấy chuyển, thành phẩm đến hạn chuyển kho thành phẩm) mà vẫn còn tồn thực và chưa được xử lý.",
    input_schema: {
      type: "object",
      properties: {
        warehouseCode: { type: "string", description: "Mã khu sản xuất. Bỏ trống = toàn hệ thống." },
        onlyOverdue: { type: "boolean", description: "true = chỉ lấy lô ĐÃ quá hạn (không lấy lô sắp đến hạn). Mặc định false." },
      },
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

async function runTraCuuKeHoachVsThucTeChiDinh(input: { plantTypeCode?: string; instructionCode?: string; days?: number }): Promise<ToolResult> {
  const days = Math.min(Math.max(input.days ?? 60, 1), 365);
  const since = new Date(Date.now() - days * 86400000);

  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      createdAt: { gte: since },
      ...(input.plantTypeCode ? { plantType: { code: { contains: input.plantTypeCode, mode: "insensitive" } } } : {}),
      ...(input.instructionCode ? { code: { contains: input.instructionCode, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      code: true,
      expectedMotherOutput: true,
      expectedFinishedOutput: true,
      plantType: { select: { code: true, name: true } },
      assignedTo: { select: { code: true, name: true } },
      dailyRecords: { select: { motherContaminatedM05: true, items: { select: { stage: true, quantityCreated: true } } } },
    },
  });

  if (instructions.length === 0) return { content: `Không tìm thấy chỉ định cấy nào khớp bộ lọc trong ${days} ngày gần nhất.` };

  const lines = instructions.map((ins) => {
    let actualMother = 0;
    let actualFinished = 0;
    for (const rec of ins.dailyRecords) {
      for (const item of rec.items) {
        if (item.stage === "MAU_ME") actualMother += item.quantityCreated;
        else actualFinished += item.quantityCreated;
      }
    }
    return `${ins.code} · ${ins.plantType.code} · NV ${ins.assignedTo ? ins.assignedTo.name : "chưa gán"}: kỳ vọng MM ${ins.expectedMotherOutput != null ? fmtQty(ins.expectedMotherOutput) : "—"} / thực tế ${fmtQty(actualMother)} · kỳ vọng TP ${ins.expectedFinishedOutput != null ? fmtQty(ins.expectedFinishedOutput) : "—"} / thực tế ${fmtQty(actualFinished)}`;
  });
  return { content: lines.join("\n") };
}

async function runTraCuuKeHoachVsThucTeRaRe(input: { warehouseCode?: string; months?: number }): Promise<ToolResult> {
  const months = Math.min(Math.max(input.months ?? 3, 1), 12);
  const now = new Date();
  const rangeStart = startOfMonth(subMonths(now, months - 1));

  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { type: "SAN_XUAT", code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true, code: true, name: true } })
    : null;
  if (input.warehouseCode && !warehouse) return { content: `Không tìm thấy khu sản xuất nào khớp "${input.warehouseCode}".` };

  // Kế hoạch — cộng dồn quantity1/2/3 của mọi RootingForecastEntry có taskMonth trong 3 tháng trước mỗi
  // tháng đang xem (khớp công thức thật ở rooting-plan-vs-actual, đơn giản hoá bỏ phần chia theo tuần).
  const candidateMonths: Date[] = [];
  for (let i = 0; i < months; i++) {
    const displayMonth = startOfMonth(subMonths(now, i));
    candidateMonths.push(subMonths(displayMonth, 1), subMonths(displayMonth, 2), subMonths(displayMonth, 3));
  }
  const planEntries = await prisma.rootingForecastEntry.findMany({
    where: { taskMonth: { in: candidateMonths }, ...(warehouse ? { warehouseId: warehouse.id } : {}) },
    select: { quantity1: true, quantity2: true, quantity3: true, assignedStaffId: true, plantTypeId: true, assignedStaff: { select: { code: true, name: true } }, plantType: { select: { code: true, name: true } } },
  });
  const totalPlan = planEntries.reduce((s, p) => s + p.quantity1 + p.quantity2 + p.quantity3, 0) / 3;

  const staffIds = warehouse
    ? (await prisma.user.findMany({ where: { role: "CAY_MO", workplaceWarehouseId: warehouse.id }, select: { id: true } })).map((s) => s.id)
    : undefined;
  const records = await prisma.dailyRecord.findMany({
    where: { recordDate: { gte: rangeStart }, instruction: { assignedToId: staffIds ? { in: staffIds } : { not: null } } },
    select: {
      staffId: true,
      staff: { select: { code: true, name: true } },
      instruction: { select: { plantType: { select: { id: true, code: true, name: true } } } },
      items: { select: { stage: true, quantityCreated: true } },
    },
  });

  type Agg = { code: string; name: string; plantTypeCode: string; actual: number };
  const byStaffPlant = new Map<string, Agg>();
  let totalActual = 0;
  for (const r of records) {
    const finished = r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s, i) => s + i.quantityCreated, 0);
    if (finished === 0) continue;
    totalActual += finished;
    const key = `${r.staffId}|${r.instruction.plantType.id}`;
    const entry = byStaffPlant.get(key) ?? { code: r.staff.code, name: r.staff.name, plantTypeCode: r.instruction.plantType.code, actual: 0 };
    entry.actual += finished;
    byStaffPlant.set(key, entry);
  }

  const topStaff = Array.from(byStaffPlant.values()).sort((a, b) => b.actual - a.actual).slice(0, 20);
  const staffLines = topStaff.map((s) => `${s.name} (${s.code}) · ${s.plantTypeCode}: ${fmtQty(s.actual)} thành phẩm`);
  const percent = totalPlan > 0 ? Math.round((totalActual / totalPlan) * 1000) / 10 : null;

  return {
    content: `${months} tháng gần nhất${warehouse ? ` tại khu ${warehouse.code} (${warehouse.name})` : " (toàn hệ thống)"}: kế hoạch ~${fmtQty(Math.round(totalPlan))} thành phẩm, thực tế ${fmtQty(totalActual)}${percent != null ? ` (đạt ${percent}%)` : ""}.\n\nTheo NV+mã cây (cao nhất trước):\n${staffLines.join("\n")}`,
  };
}

async function runTraCuuNhatKyCay(input: { mode?: "week" | "month"; warehouseCode?: string; staffCode?: string }): Promise<ToolResult> {
  const mode = input.mode ?? "week";
  const now = new Date();
  const rangeStart = mode === "week" ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
  const rangeEnd = new Date();

  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true } })
    : null;

  const records = await prisma.dailyRecord.findMany({
    where: {
      recordDate: { gte: rangeStart, lte: rangeEnd },
      staff: {
        role: "CAY_MO",
        ...(warehouse ? { workplaceWarehouseId: warehouse.id } : {}),
        ...(input.staffCode ? { code: { contains: input.staffCode, mode: "insensitive" } } : {}),
      },
    },
    select: {
      staffId: true,
      motherUsed: true,
      staff: { select: { code: true, name: true } },
      items: { select: { stage: true, quantityCreated: true } },
    },
  });

  if (records.length === 0) return { content: `Không có nhật ký cấy nào khớp bộ lọc trong ${mode === "week" ? "tuần" : "tháng"} này.` };

  type Agg = { code: string; name: string; motherUsed: number; motherOut: number; finishedOut: number };
  const byStaff = new Map<string, Agg>();
  for (const r of records) {
    const entry = byStaff.get(r.staffId) ?? { code: r.staff.code, name: r.staff.name, motherUsed: 0, motherOut: 0, finishedOut: 0 };
    entry.motherUsed += r.motherUsed;
    for (const item of r.items) {
      if (item.stage === "MAU_ME") entry.motherOut += item.quantityCreated;
      else entry.finishedOut += item.quantityCreated;
    }
    byStaff.set(r.staffId, entry);
  }
  const rows = Array.from(byStaff.values()).sort((a, b) => b.motherUsed - a.motherUsed);
  const lines = rows.map((r) => `${r.name} (${r.code}): dùng ${fmtQty(r.motherUsed)} MM, cấy ra MM ${fmtQty(r.motherOut)}, cấy ra TP ${fmtQty(r.finishedOut)}`);
  return { content: lines.join("\n") };
}

async function runTraCuuSanLuongGhiNhan(input: { warehouseCode?: string; dateFrom?: string; dateTo?: string }): Promise<ToolResult> {
  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true, code: true, name: true } })
    : null;
  if (input.warehouseCode && !warehouse) return { content: `Không tìm thấy khu sản xuất nào khớp "${input.warehouseCode}".` };

  const result = await computeProductionRecordForPeriod(input.dateFrom, input.dateTo, warehouse?.id);
  if (result.rows.length === 0) return { content: "Không có dữ liệu sản lượng ghi nhận nào khớp bộ lọc." };

  const lines = result.rows
    .slice(0, 30)
    .map((r) => `${r.staffName} (${r.staffCode})${r.warehouseName ? ` · ${r.warehouseName}` : ""}: bàn giao ${fmtQty(r.totalHandedOverQuantity)}, ghi nhận ${fmtQty(r.totalRecordedQuantity)}, không đạt ${fmtQty(r.totalUnqualifiedQuantity)}, nhiễm ${fmtQty(r.totalContaminatedQuantity)}`);
  return { content: `Từ ${result.rangeStart.toISOString().slice(0, 10)} đến ${result.rangeEnd.toISOString().slice(0, 10)}:\n${lines.join("\n")}` };
}

async function runTraCuuNangLucSanXuat(input: { plantTypeCode: string; warehouseCode?: string }): Promise<ToolResult> {
  const plantType = await prisma.plantType.findFirst({ where: { code: { contains: input.plantTypeCode, mode: "insensitive" } }, select: { id: true, code: true, name: true } });
  if (!plantType) return { content: `Không tìm thấy mã cây nào khớp "${input.plantTypeCode}".` };
  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true, code: true } })
    : null;
  if (input.warehouseCode && !warehouse) return { content: `Không tìm thấy khu sản xuất nào khớp "${input.warehouseCode}".` };

  const since = startOfWeek(subWeeks(new Date(), 3), { weekStartsOn: 1 });
  const records = await prisma.dailyRecord.findMany({
    where: {
      recordDate: { gte: since },
      instruction: { plantTypeId: plantType.id },
      ...(warehouse ? { staff: { workplaceWarehouseId: warehouse.id } } : {}),
    },
    select: { recordDate: true, items: { select: { stage: true, quantityCreated: true } } },
  });

  type WeekAgg = { motherOut: number; finishedOut: number };
  const byWeek = new Map<string, WeekAgg>();
  for (const r of records) {
    const weekKey = startOfWeek(r.recordDate, { weekStartsOn: 1 }).toISOString().slice(0, 10);
    const entry = byWeek.get(weekKey) ?? { motherOut: 0, finishedOut: 0 };
    for (const item of r.items) {
      if (item.stage === "MAU_ME") entry.motherOut += item.quantityCreated;
      else entry.finishedOut += item.quantityCreated;
    }
    byWeek.set(weekKey, entry);
  }
  if (byWeek.size === 0) return { content: `Không có dữ liệu cấy nào cho mã cây ${plantType.code} trong 4 tuần gần nhất.` };
  const lines = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, agg]) => `Tuần từ ${week}: cấy ra MM ${fmtQty(agg.motherOut)}, cấy ra TP ${fmtQty(agg.finishedOut)}`);
  return { content: `Xu hướng sản lượng ${plantType.code} (${plantType.name}) 4 tuần gần nhất:\n${lines.join("\n")}` };
}

async function runTraCuuMauMeGiaTang(input: { warehouseCode?: string; weeksBack?: number }): Promise<ToolResult> {
  const weeksBack = Math.min(Math.max(input.weeksBack ?? 4, 1), 26);
  const weekNPlusXStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekNStart = subWeeks(weekNPlusXStart, weeksBack - 1);

  const warehouses = await prisma.warehouse.findMany({
    where: { type: "SAN_XUAT", isActive: true, ...(input.warehouseCode ? { code: { contains: input.warehouseCode, mode: "insensitive" } } : {}) },
    select: { id: true, code: true, name: true },
  });
  if (warehouses.length === 0) return { content: `Không tìm thấy khu sản xuất nào khớp "${input.warehouseCode}".` };

  const lines: string[] = [];
  for (const wh of warehouses.slice(0, 10)) {
    const rows = await computeMotherStockGrowth(wh.id, [], weekNStart, weekNPlusXStart);
    for (const r of rows.filter((x) => x.growth !== 0).sort((a, b) => b.growth - a.growth).slice(0, 10)) {
      lines.push(`${wh.code} · ${r.code} (${r.name}): gia tăng ${r.growth > 0 ? "+" : ""}${fmtQty(r.growth)}, tồn cuối kỳ ${fmtQty(r.endBalance)}`);
    }
  }
  if (lines.length === 0) return { content: `Không có gia tăng mẫu mẹ nào trong ${weeksBack} tuần gần nhất.` };
  return { content: lines.join("\n") };
}

async function runTraCuuDanhGiaChatLuongRaRe(input: { warehouseCode?: string; limit?: number }): Promise<ToolResult> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const evaluations = await prisma.rootingQualityEvaluation.findMany({
    where: {
      status: "COMPLETED",
      ...(input.warehouseCode ? { warehouse: { code: { contains: input.warehouseCode, mode: "insensitive" } } } : {}),
    },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      code: true,
      weekStart: true,
      warehouse: { select: { code: true } },
      items: { select: { totalQuantity: true, passedQuantity: true, failedQuantity: true, plantType: { select: { code: true } } } },
    },
  });
  if (evaluations.length === 0) return { content: "Không có đánh giá chất lượng cây ra rễ nào đã hoàn thành khớp bộ lọc." };

  const lines = evaluations.map((e) => {
    const total = e.items.reduce((s, i) => s + i.totalQuantity, 0);
    const passed = e.items.reduce((s, i) => s + i.passedQuantity, 0);
    const rate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
    const plantTypeCodes = Array.from(new Set(e.items.map((i) => i.plantType.code))).join(", ");
    return `${e.code} · khu ${e.warehouse.code} · ${plantTypeCodes} · tuần ${e.weekStart.toISOString().slice(0, 10)}: đạt ${fmtQty(passed)}/${fmtQty(total)} (${rate}%)`;
  });
  return { content: lines.join("\n") };
}

async function runTraCuuLuongKiemTra(input: { warehouseCode?: string; lane?: "XANH" | "VANG" | "DO" }): Promise<ToolResult> {
  const staff = await prisma.user.findMany({
    where: {
      role: "CAY_MO",
      isActive: true,
      ...(input.lane ? { inspectionLane: input.lane } : {}),
      ...(input.warehouseCode ? { workplaceWarehouse: { code: { contains: input.warehouseCode, mode: "insensitive" } } } : {}),
    },
    select: {
      code: true,
      name: true,
      inspectionLane: true,
      workplaceWarehouse: { select: { code: true } },
      inspectionLaneMonthlyResults: { orderBy: { applyMonth: "desc" }, take: 1, select: { combinedRatePct: true } },
    },
    orderBy: { code: "asc" },
  });
  if (staff.length === 0) return { content: "Không có NV cấy mô nào khớp bộ lọc." };
  const lines = staff.map(
    (s) => `${s.name} (${s.code}) · khu ${s.workplaceWarehouse?.code ?? "chưa gán"}: luồng ${s.inspectionLane ?? "chưa có dữ liệu"}${s.inspectionLaneMonthlyResults[0] ? ` (tỉ lệ nhiễm tổng hợp ${s.inspectionLaneMonthlyResults[0].combinedRatePct}%)` : ""}`
  );
  return { content: lines.join("\n") };
}

async function runTraCuuPhieuKhongDatNhiem(input: { month?: string; warehouseCode?: string }): Promise<ToolResult> {
  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true } })
    : null;
  if (input.warehouseCode && !warehouse) return { content: `Không tìm thấy khu sản xuất nào khớp "${input.warehouseCode}".` };

  const result = await computeInspectionDefectReport(input.month, warehouse?.id);
  if (result.tickets.length === 0) return { content: "Không có phiếu kiểm tra không đạt/nhiễm nào khớp bộ lọc." };

  const lines = result.staffSummary
    .slice(0, 30)
    .map((s) => `${s.staffName} (${s.staffCode}): ${s.ticketCount} phiếu, không đạt ${fmtQty(s.totalUnqualifiedQuantity)}, nhiễm ${fmtQty(s.totalContaminatedQuantity)}`);
  return { content: lines.join("\n") };
}

async function runTraCuuLechChiDinh(input: { cause?: string; staffCode?: string; month?: string }): Promise<ToolResult> {
  const monthDate = input.month ? new Date(`${input.month}-01T00:00:00`) : null;
  const hasValidMonth = !!monthDate && !Number.isNaN(monthDate.getTime());

  const alerts = await prisma.alert.findMany({
    where: {
      type: "OUTPUT_DEVIATION",
      relatedType: "PlantingInstruction",
      ...(hasValidMonth ? { createdAt: { gte: monthDate!, lt: new Date(monthDate!.getFullYear(), monthDate!.getMonth() + 1, 1) } } : {}),
      ...(input.cause === "UNRESOLVED" ? { cause: null } : input.cause ? { cause: input.cause as never } : {}),
    },
    select: { id: true, relatedId: true, cause: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const instructionIds = Array.from(new Set(alerts.map((a) => a.relatedId).filter((v): v is string => !!v)));
  const instructions = instructionIds.length
    ? await prisma.plantingInstruction.findMany({
        where: { id: { in: instructionIds } },
        select: { id: true, code: true, assignedTo: { select: { code: true, name: true } } },
      })
    : [];
  const instructionById = new Map(instructions.map((i) => [i.id, i]));

  const staffFilterLower = input.staffCode?.toLowerCase();
  const rows = alerts
    .map((a) => ({ alert: a, instruction: a.relatedId ? instructionById.get(a.relatedId) : null }))
    .filter((r) => !!r.instruction && (!staffFilterLower || r.instruction!.assignedTo?.code.toLowerCase().includes(staffFilterLower)))
    .slice(0, 30);

  if (rows.length === 0) return { content: "Không tìm thấy lần lệch chỉ định nào khớp bộ lọc." };
  const lines = rows.map(
    (r) => `${r.instruction!.code} · NV ${r.instruction!.assignedTo ? r.instruction!.assignedTo.name : "—"} · ${r.alert.cause ?? "chưa xử lý"} · ${r.alert.createdAt.toISOString().slice(0, 10)}`
  );

  const recentCayMoSai = await prisma.alert.findMany({
    where: { type: "OUTPUT_DEVIATION", relatedType: "PlantingInstruction", cause: "CAY_MO_SAI", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    select: { relatedId: true },
  });
  const recentIds = Array.from(new Set(recentCayMoSai.map((a) => a.relatedId).filter((v): v is string => !!v)));
  const recentInstructions = recentIds.length
    ? await prisma.plantingInstruction.findMany({ where: { id: { in: recentIds } }, select: { assignedTo: { select: { code: true, name: true } } } })
    : [];
  const repeatCount = new Map<string, { name: string; count: number }>();
  for (const inst of recentInstructions) {
    if (!inst.assignedTo) continue;
    const entry = repeatCount.get(inst.assignedTo.code) ?? { name: inst.assignedTo.name, count: 0 };
    entry.count += 1;
    repeatCount.set(inst.assignedTo.code, entry);
  }
  const repeatOffenders = Array.from(repeatCount.entries()).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count);
  const repeatText = repeatOffenders.length > 0
    ? `\n\nTái phạm ≥2 lần trong 30 ngày gần đây: ${repeatOffenders.map(([code, v]) => `${v.name} (${code}): ${v.count} lần`).join(", ")}`
    : "";

  return { content: lines.join("\n") + repeatText };
}

async function runTraCuuNhapXuat(input: { warehouseCode?: string; dateFrom?: string; dateTo?: string }): Promise<ToolResult> {
  const rangeStart = input.dateFrom ? new Date(`${input.dateFrom}T00:00:00`) : startOfMonth(new Date());
  const rangeEnd = input.dateTo ? new Date(`${input.dateTo}T23:59:59`) : new Date();
  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { type: "THANH_PHAM", code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true, code: true } })
    : null;
  if (input.warehouseCode && !warehouse) return { content: `Không tìm thấy kho thành phẩm nào khớp "${input.warehouseCode}".` };

  const [receipts, orderItems, proposals] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where: {
        status: "CONFIRMED",
        supplierId: { not: null },
        ...(warehouse ? { room: { warehouseId: warehouse.id } } : {}),
        OR: [{ confirmedAt: { gte: rangeStart, lte: rangeEnd } }, { confirmedAt: null, createdAt: { gte: rangeStart, lte: rangeEnd } }],
      },
      select: { items: { select: { quantityPassed: true } } },
    }),
    prisma.orderItem.findMany({
      where: {
        order: { status: "SHIPPED", shippedAt: { gte: rangeStart, lte: rangeEnd } },
        ...(warehouse ? { lot: { room: { warehouseId: warehouse.id } } } : {}),
      },
      select: { quantity: true },
    }),
    prisma.contaminationProposal.findMany({
      where: { status: "APPROVED", createdAt: { gte: rangeStart, lte: rangeEnd }, ...(warehouse ? { warehouseId: warehouse.id } : {}) },
      select: { type: true, quantity: true },
    }),
  ]);

  const totalIn = receipts.reduce((s, r) => s + r.items.reduce((s2, i) => s2 + i.quantityPassed, 0), 0);
  const totalOutOrders = orderItems.reduce((s, i) => s + i.quantity, 0);
  const totalOutTrong = proposals.filter((p) => p.type === "TRONG").reduce((s, p) => s + p.quantity, 0);
  const totalOutHuy = proposals.filter((p) => p.type === "HUY").reduce((s, p) => s + p.quantity, 0);

  return {
    content: `Từ ${rangeStart.toISOString().slice(0, 10)} đến ${rangeEnd.toISOString().slice(0, 10)}${warehouse ? ` tại kho ${warehouse.code}` : ""}: Nhập từ NCC ${fmtQty(totalIn)}, Xuất đơn hàng ${fmtQty(totalOutOrders)}, Trồng ${fmtQty(totalOutTrong)}, Hủy ${fmtQty(totalOutHuy)}.`,
  };
}

async function runTraCuuTonKhoQuaHan(input: { warehouseCode?: string; onlyOverdue?: boolean }): Promise<ToolResult> {
  const warehouse = input.warehouseCode
    ? await prisma.warehouse.findFirst({ where: { code: { contains: input.warehouseCode, mode: "insensitive" } }, select: { id: true, code: true } })
    : null;
  if (input.warehouseCode && !warehouse) return { content: `Không tìm thấy khu vực nào khớp "${input.warehouseCode}".` };

  const activeLots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      quantity: { gt: 0 },
      ...(warehouse ? { OR: [{ shelf: { warehouseId: warehouse.id } }, { room: { warehouseId: warehouse.id } }] } : {}),
    },
    select: {
      code: true,
      stage: true,
      quantity: true,
      expectedMoveAt: true,
      plantType: { select: { code: true, name: true } },
      shelf: { select: { id: true } },
      instructionItems: { select: { instruction: { select: { status: true } } } },
    },
    take: 3000,
  });

  const isPendingTransfer = (lot: (typeof activeLots)[number]) => {
    if (lot.stage === "THANH_PHAM") return !!lot.shelf;
    return !lot.instructionItems.some((it) => it.instruction.status === "ACTIVE" || it.instruction.status === "DRAFT");
  };
  const now = new Date();
  const rows = activeLots
    .filter((l) => isNearExpiry(l.expectedMoveAt) && isPendingTransfer(l))
    .filter((l) => !input.onlyOverdue || (l.expectedMoveAt && l.expectedMoveAt < now))
    .sort((a, b) => (a.expectedMoveAt?.getTime() ?? 0) - (b.expectedMoveAt?.getTime() ?? 0))
    .slice(0, 50);

  if (rows.length === 0) return { content: "Không có lô nào sắp/quá hạn khớp bộ lọc." };
  const lines = rows.map((l) => {
    const overdue = l.expectedMoveAt && l.expectedMoveAt < now;
    return `${l.code} · ${l.plantType.code} (${l.plantType.name}) · ${l.stage} · ${fmtQty(l.quantity)} cây · hạn ${l.expectedMoveAt?.toISOString().slice(0, 10)}${overdue ? " (ĐÃ QUÁ HẠN)" : " (sắp đến hạn)"}`;
  });
  return { content: lines.join("\n") };
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
      case "tra_cuu_ke_hoach_vs_thuc_te_chi_dinh":
        return await runTraCuuKeHoachVsThucTeChiDinh(input as never);
      case "tra_cuu_ke_hoach_vs_thuc_te_ra_re":
        return await runTraCuuKeHoachVsThucTeRaRe(input as never);
      case "tra_cuu_nhat_ky_cay":
        return await runTraCuuNhatKyCay(input as never);
      case "tra_cuu_san_luong_ghi_nhan":
        return await runTraCuuSanLuongGhiNhan(input as never);
      case "tra_cuu_nang_luc_san_xuat":
        return await runTraCuuNangLucSanXuat(input as never);
      case "tra_cuu_mau_me_gia_tang":
        return await runTraCuuMauMeGiaTang(input as never);
      case "tra_cuu_danh_gia_chat_luong_ra_re":
        return await runTraCuuDanhGiaChatLuongRaRe(input as never);
      case "tra_cuu_luong_kiem_tra":
        return await runTraCuuLuongKiemTra(input as never);
      case "tra_cuu_phieu_khong_dat_nhiem":
        return await runTraCuuPhieuKhongDatNhiem(input as never);
      case "tra_cuu_lech_chi_dinh":
        return await runTraCuuLechChiDinh(input as never);
      case "tra_cuu_nhap_xuat":
        return await runTraCuuNhapXuat(input as never);
      case "tra_cuu_ton_kho_qua_han":
        return await runTraCuuTonKhoQuaHan(input as never);
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
