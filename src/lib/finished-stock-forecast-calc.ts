// Tính "Tồn kho thành phẩm dự kiến" — phần thuần tính toán (không đụng DB, nạp dữ liệu ở
// src/lib/finished-stock-forecast.ts). A(N) = B + A2 + A3 − A4:
// - B: tồn thực Phòng đạt tiêu chuẩn.
// - A2: hàng khu sản xuất — lô đã lên giàn Phòng ra rễ (chưa đánh giá: nhân tỉ lệ, làm tròn xuống theo túi; đã
//   đánh giá/đang trên đường: nguyên số) và số đăng ký sản xuất (nhân tỉ lệ, chưa có quy cách).
// - A3: Phiếu dự kiến nhập từ NCC chưa quá ngày giao.
// - A4: đơn HELD/CONFIRMED chưa xuất, trừ vào ngày xuất của đơn.
// Mọi ngày là chuỗi "yyyy-MM-dd" theo giờ Việt Nam để so sánh trực tiếp, không phụ thuộc timezone tiến trình.
import { FINISHED_SPEC_BAG_SIZE } from "@/types";

export const FORECAST_RATE_KEY = "finished_forecast_rate_pct";
export const DEFAULT_FORECAST_RATE_PCT = 80;
export const FORECAST_REGISTERED_UPLOAD_KEY = "finished_forecast_registered_upload";
// Chu kỳ Nhóm tuần ra rễ mặc định khi chưa cấu hình Nhóm nào.
const DEFAULT_ROOTING_SLOTS = 4;

export type ForecastEventKind = "IN_TRANSIT" | "ROOTING_EVALUATED" | "ROOTING_ESTIMATED" | "REGISTERED" | "SUPPLIER" | "ORDER";

export type ForecastEvent = {
  plantTypeId: string;
  dateKey: string;
  kind: ForecastEventKind;
  stageCode: string | null; // null = số đăng ký sản xuất, chưa có quy cách
  quantity: number; // âm = trừ tồn
  note?: string;
};

export type ForecastInput = {
  todayKey: string;
  ratePct: number;
  rootingSlots: number;
  stock: { plantTypeId: string; stageCode: string; quantity: number }[];
  rootingLots: { plantTypeId: string; stageCode: string; quantity: number; pendingQuantity: number; dueKey: string; evaluated: boolean }[];
  registered: { plantTypeId: string; monthKey: string; quantity: number }[]; // monthKey "yyyy-MM"
  supplierPlans: { plantTypeId: string; stageCode: string; quantity: number; dateKey: string; note: string }[];
  orders: { plantTypeId: string; stageCode: string; quantity: number; dateKey: string; note: string }[];
};

export type ForecastRow = {
  plantTypeId: string;
  stock: number;
  rooting: number;
  registered: number;
  supplier: number;
  orders: number;
  projected: number; // A(N)
  lowestFromDate: number; // A thấp nhất từ N trở về sau — số đáp ứng được cho đơn có mốc N
  byStage: { stageCode: string | null; quantity: number }[]; // cộng lại đúng bằng projected
  events: ForecastEvent[];
};

const toUtc = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysKey(key: string, days: number): string {
  return toKey(new Date(toUtc(key).getTime() + days * 86_400_000));
}

// Thứ 2 của tuần chứa ngày (tuần bắt đầu Thứ 2).
export function mondayKey(key: string): string {
  const dow = toUtc(key).getUTCDay();
  return addDaysKey(key, dow === 0 ? -6 : 1 - dow);
}

const thursdayOfWeekKey = (key: string) => addDaysKey(mondayKey(key), 3);

// 4 thứ 5 CUỐI của tháng — tháng có 5 thứ 5 thì bỏ thứ 5 đầu (coi hàng về muộn cho an toàn).
export function lastFourThursdays(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const thursdays: string[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d = new Date(d.getTime() + 86_400_000)) {
    if (d.getUTCDay() === 4) thursdays.push(toKey(d));
  }
  return thursdays.slice(-4);
}

const bagSizeOf = (stageCode: string) => FINISHED_SPEC_BAG_SIZE[stageCode as keyof typeof FINISHED_SPEC_BAG_SIZE] ?? 1;
const applyRate = (quantity: number, ratePct: number) => Math.floor((quantity * ratePct) / 100);

export function buildForecastEvents(input: ForecastInput): ForecastEvent[] {
  const { todayKey, ratePct } = input;
  const slots = input.rootingSlots > 0 ? input.rootingSlots : DEFAULT_ROOTING_SLOTS;
  const events: ForecastEvent[] = [];
  const notBeforeToday = (key: string) => (key < todayKey ? todayKey : key);

  // Lô đã lên giàn — gộp theo (mã cây, quy cách, tuần đến hạn) rồi mới nhân tỉ lệ + làm tròn túi, tránh mất số do
  // làm tròn từng lô nhỏ. Hàng đang bàn giao (Transfer PENDING) vẫn nằm trên lô tới khi Kho TP nhận nên tách riêng.
  const estimated = new Map<string, { plantTypeId: string; stageCode: string; thursday: string; quantity: number }>();
  const rootingByWeek = new Map<string, number>(); // `${plantTypeId}|${thứ 5}` -> tổng số đã tính, so với số đăng ký
  const addWeekTotal = (plantTypeId: string, thursday: string, quantity: number) => {
    const key = `${plantTypeId}|${thursday}`;
    rootingByWeek.set(key, (rootingByWeek.get(key) ?? 0) + quantity);
  };

  for (const lot of input.rootingLots) {
    const thursday = thursdayOfWeekKey(lot.dueKey);
    const pending = Math.min(lot.pendingQuantity, lot.quantity);
    const rest = lot.quantity - pending;
    if (pending > 0) {
      events.push({ plantTypeId: lot.plantTypeId, dateKey: todayKey, kind: "IN_TRANSIT", stageCode: lot.stageCode, quantity: pending });
      addWeekTotal(lot.plantTypeId, thursday, pending);
    }
    if (rest <= 0) continue;
    if (lot.evaluated) {
      events.push({ plantTypeId: lot.plantTypeId, dateKey: notBeforeToday(thursday), kind: "ROOTING_EVALUATED", stageCode: lot.stageCode, quantity: rest });
      addWeekTotal(lot.plantTypeId, thursday, rest);
    } else {
      const key = `${lot.plantTypeId}|${lot.stageCode}|${thursday}`;
      const entry = estimated.get(key) ?? { plantTypeId: lot.plantTypeId, stageCode: lot.stageCode, thursday, quantity: 0 };
      entry.quantity += rest;
      estimated.set(key, entry);
    }
  }
  for (const e of estimated.values()) {
    const bag = bagSizeOf(e.stageCode);
    const quantity = Math.floor(applyRate(e.quantity, ratePct) / bag) * bag;
    if (quantity <= 0) continue;
    events.push({ plantTypeId: e.plantTypeId, dateKey: notBeforeToday(e.thursday), kind: "ROOTING_ESTIMATED", stageCode: e.stageCode, quantity });
    addWeekTotal(e.plantTypeId, e.thursday, quantity);
  }

  // Số đăng ký: cộng theo (mã cây, tháng), nhân tỉ lệ, chia đều 4 thứ 5 cuối tháng (phần dư vào tuần cuối). Tuần đã
  // qua thì bỏ. Còn trong/trước tuần lên giàn của lứa đó: tính phần lớn hơn so với số lô đã lên giàn; qua tuần lên
  // giàn rồi (cây lên giàn tuần W bàn giao tuần W + số Nhóm − 1) thì chỉ còn số lô thật.
  const registeredByMonth = new Map<string, { plantTypeId: string; monthKey: string; quantity: number }>();
  for (const r of input.registered) {
    const key = `${r.plantTypeId}|${r.monthKey}`;
    const entry = registeredByMonth.get(key) ?? { plantTypeId: r.plantTypeId, monthKey: r.monthKey, quantity: 0 };
    entry.quantity += r.quantity;
    registeredByMonth.set(key, entry);
  }
  const thisMonday = mondayKey(todayKey);
  for (const r of registeredByMonth.values()) {
    const total = applyRate(r.quantity, ratePct);
    if (total <= 0) continue;
    const thursdays = lastFourThursdays(r.monthKey);
    const share = Math.floor(total / thursdays.length);
    thursdays.forEach((thursday, i) => {
      if (thursday < todayKey) return;
      const weekShare = i === thursdays.length - 1 ? total - share * (thursdays.length - 1) : share;
      const entryMonday = addDaysKey(mondayKey(thursday), -7 * (slots - 1));
      if (thisMonday > entryMonday) return;
      const remaining = weekShare - (rootingByWeek.get(`${r.plantTypeId}|${thursday}`) ?? 0);
      if (remaining <= 0) return;
      events.push({ plantTypeId: r.plantTypeId, dateKey: thursday, kind: "REGISTERED", stageCode: null, quantity: remaining });
    });
  }

  for (const p of input.supplierPlans) {
    if (p.dateKey < todayKey || p.quantity <= 0) continue; // quá ngày giao: không tính nữa
    events.push({ plantTypeId: p.plantTypeId, dateKey: p.dateKey, kind: "SUPPLIER", stageCode: p.stageCode, quantity: p.quantity, note: p.note });
  }
  for (const o of input.orders) {
    if (o.quantity <= 0) continue;
    events.push({ plantTypeId: o.plantTypeId, dateKey: notBeforeToday(o.dateKey), kind: "ORDER", stageCode: o.stageCode, quantity: -o.quantity, note: o.note });
  }

  return events.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function computeForecastRows(input: ForecastInput, dateKey: string): ForecastRow[] {
  const events = buildForecastEvents(input);
  const eventsByPlant = new Map<string, ForecastEvent[]>();
  for (const e of events) eventsByPlant.set(e.plantTypeId, [...(eventsByPlant.get(e.plantTypeId) ?? []), e]);

  const stockByPlant = new Map<string, Map<string, number>>();
  for (const s of input.stock) {
    const stages = stockByPlant.get(s.plantTypeId) ?? new Map<string, number>();
    stages.set(s.stageCode, (stages.get(s.stageCode) ?? 0) + s.quantity);
    stockByPlant.set(s.plantTypeId, stages);
  }

  const plantIds = new Set([...stockByPlant.keys(), ...eventsByPlant.keys()]);
  const rows: ForecastRow[] = [];
  for (const plantTypeId of plantIds) {
    const stages = stockByPlant.get(plantTypeId) ?? new Map<string, number>();
    const stock = [...stages.values()].reduce((s, q) => s + q, 0);
    const plantEvents = eventsByPlant.get(plantTypeId) ?? [];

    const row: ForecastRow = { plantTypeId, stock, rooting: 0, registered: 0, supplier: 0, orders: 0, projected: stock, lowestFromDate: 0, byStage: [], events: plantEvents };
    const byStage = new Map<string | null, number>(stages);
    let running = stock;
    let lowest: number | null = null;
    let index = 0;
    for (; index < plantEvents.length && plantEvents[index].dateKey <= dateKey; index++) {
      const e = plantEvents[index];
      running += e.quantity;
      byStage.set(e.stageCode, (byStage.get(e.stageCode) ?? 0) + e.quantity);
      if (e.kind === "REGISTERED") row.registered += e.quantity;
      else if (e.kind === "SUPPLIER") row.supplier += e.quantity;
      else if (e.kind === "ORDER") row.orders -= e.quantity;
      else row.rooting += e.quantity;
    }
    row.projected = running;
    lowest = running;
    // Các biến động cùng ngày cộng trước rồi mới so, tránh báo thấp giả do thứ tự sắp xếp trong ngày.
    for (; index < plantEvents.length; index++) {
      running += plantEvents[index].quantity;
      if (index + 1 === plantEvents.length || plantEvents[index + 1].dateKey !== plantEvents[index].dateKey) lowest = Math.min(lowest, running);
    }
    row.lowestFromDate = lowest;
    row.byStage = [...byStage.entries()]
      .filter(([, quantity]) => quantity !== 0)
      .map(([stageCode, quantity]) => ({ stageCode, quantity }))
      .sort((a, b) => (a.stageCode ?? "~").localeCompare(b.stageCode ?? "~"));
    rows.push(row);
  }
  return rows;
}
