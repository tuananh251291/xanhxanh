"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Loader2, X } from "lucide-react";
import { setISOWeek, setISOWeekYear, startOfISOWeek, format as formatDate } from "date-fns";
import ReportLineChart from "../charts/report-line-chart";

type PlantType = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type Staff = { id: string; code: string; name: string; role: string };
type ComboOption = { value: string; label: string };

type Unit = "week" | "month";
type ScopeKind = "all" | "warehouse" | "staff";

// `<input type="week">` trả về "YYYY-Www" (tuần ISO), `<input type="month">` trả về "YYYY-MM" — quy đổi
// sang ngày bất kỳ trong kỳ đó (yyyy-MM-dd) để gửi cho API (API tự làm tròn chẵn tuần/chẵn tháng, chỉ
// cần 1 ngày đại diện đúng kỳ, ở đây lấy Thứ 2 đầu tuần ISO hoặc mùng 1 đầu tháng).
function periodValueToDateStr(value: string, unit: Unit): string {
  if (!value) return "";
  if (unit === "week") {
    const m = value.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return "";
    const withYear = setISOWeekYear(new Date(), Number(m[1]));
    const withWeek = setISOWeek(withYear, Number(m[2]));
    return formatDate(startOfISOWeek(withWeek), "yyyy-MM-dd");
  }
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-01`;
}

export default function ProductionCapacityBoard() {
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  const [unit, setUnit] = useState<Unit>("week");
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption | null>(null);
  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [scopeOption, setScopeOption] = useState<ComboOption | null>(null);
  // Quãng thời gian tự nhập (tuỳ chọn) — để trống cả 2 thì API tự dùng mặc định 10 kỳ gần nhất + 1 kỳ
  // kế tiếp. Nhập theo ĐÚNG đơn vị đang chọn (tuần ISO qua <input type="week">, tháng qua
  // <input type="month">) — không hiện ngày trực tiếp. "Đến" có thể chọn ở tương lai để kéo dài đường đỏ
  // dự báo tới hết kỳ đó (xem production-capacity/route.ts).
  const [fromPeriod, setFromPeriod] = useState("");
  const [toPeriod, setToPeriod] = useState("");

  const [data, setData] = useState<Record<string, string | number>[]>([]);
  const [staffing, setStaffing] = useState<{ period: string; motherProcessed: number; workDaysNeeded: number }[]>([]);
  const [ratios, setRatios] = useState({ avgRatioMM: 0, avgRatioTP: 0, avgMotherPerStaffDay: 0 });
  // Tham số NV tự nhập — 1 số áp dụng chung cho mọi kỳ đang xem (số ngày làm việc thực tế của 1 NV trong
  // 1 kỳ, VD trừ nghỉ thì còn ~24 ngày/tháng) — chia tiếp cho "Số ngày cấy cần" ra "Số nhân sự cần", tính
  // ở FE để đổi số không cần gọi lại API (server trả sẵn "Số ngày cấy cần", không phụ thuộc tham số này).
  const [workDaysPerStaff, setWorkDaysPerStaff] = useState("");
  // Số nhân sự THỰC TẾ dự kiến bố trí — nhập riêng từng kỳ (period -> chuỗi số), dùng để tính "Dự kiến
  // theo số nhân sự" (kịch bản có giới hạn, khác kịch bản tối đa ở staffing/workDaysPerStaff phía trên).
  const [staffCounts, setStaffCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/plant-types").then((r) => r.json()).then((d) => setPlantTypes(Array.isArray(d) ? d : []));
    fetch("/api/warehouses?type=SAN_XUAT").then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : []));
    fetch("/api/users").then((r) => r.json()).then((d) => setStaffList(Array.isArray(d) ? d.filter((u: Staff) => u.role === "CAY_MO") : []));
  }, []);

  const plantTypeOptions = useMemo(
    () => plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
    [plantTypes]
  );
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const staffOptions = useMemo(() => staffList.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })), [staffList]);

  const load = useCallback(async () => {
    if (!plantTypeOption) { setData([]); return; }
    if (scopeKind !== "all" && !scopeOption) { setData([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ unit, plantTypeId: plantTypeOption.value, scope: scopeKind });
      if (scopeKind !== "all" && scopeOption) params.set("scopeId", scopeOption.value);
      const fromStr = periodValueToDateStr(fromPeriod, unit);
      const toStr = periodValueToDateStr(toPeriod, unit);
      if (fromStr && toStr) { params.set("from", fromStr); params.set("to", toStr); }
      const res = await fetch(`/api/reports/production-capacity?${params}`);
      const json = await res.json();
      setData(Array.isArray(json.data) ? json.data : []);
      setStaffing(Array.isArray(json.staffing) ? json.staffing : []);
      setRatios({
        avgRatioMM: Number(json.avgRatioMM) || 0,
        avgRatioTP: Number(json.avgRatioTP) || 0,
        avgMotherPerStaffDay: Number(json.avgMotherPerStaffDay) || 0,
      });
      setStaffCounts({});
    } finally {
      setLoading(false);
    }
  }, [unit, plantTypeOption, scopeKind, scopeOption, fromPeriod, toPeriod]);

  useEffect(() => { load(); }, [load]);

  // "Dự kiến theo số nhân sự thực tế" — kịch bản CÓ giới hạn nhân sự, khác kịch bản tối đa ở bảng
  // "Số ngày cấy cần"/"Số nhân sự cần" phía trên (giả định không giới hạn). Xử lý TUẦN TỰ theo từng kỳ,
  // dồn phần mẫu mẹ đến tuổi nhưng chưa đủ người cấy sang kỳ kế tiếp (backlog) — đơn giản hoá ở mức tổng
  // số lượng, KHÔNG mô phỏng lại toàn bộ chu kỳ xoay vòng từng Nhóm dưới ràng buộc nhân sự (xem mô tả).
  const cappedRows = useMemo(() => {
    const days = Number(workDaysPerStaff) || 0;
    type CappedRow = {
      period: string; need: number; processed: number; leftover: number;
      motherForecast: number; finishedForecast: number; total: number;
    };
    return staffing.reduce<{ rows: CappedRow[]; backlog: number }>(
      (acc, s) => {
        const staffCount = Number(staffCounts[s.period]) || 0;
        const capacity = staffCount * days * ratios.avgMotherPerStaffDay;
        const need = s.motherProcessed + acc.backlog;
        const processed = Math.min(need, capacity);
        const leftover = Math.max(0, need - capacity);
        const motherForecast = processed * ratios.avgRatioMM;
        const finishedForecast = motherForecast * ratios.avgRatioTP;
        const row: CappedRow = {
          period: s.period,
          need: Math.round(need),
          processed: Math.round(processed),
          leftover: Math.round(leftover),
          motherForecast: Math.round(motherForecast),
          finishedForecast: Math.round(finishedForecast),
          total: Math.round(motherForecast + finishedForecast),
        };
        return { rows: [...acc.rows, row], backlog: leftover };
      },
      { rows: [], backlog: 0 }
    ).rows;
  }, [staffing, staffCounts, workDaysPerStaff, ratios]);

  return (
    <Card>
      <CardHeader>
        <div className="space-y-4">
          <ul className="text-sm text-text-secondary space-y-1.5 list-disc pl-5">
            <li>
              Luôn hiện <span className="font-semibold text-foreground">cả 3 đường</span> cùng lúc, phân
              biệt bằng màu:{" "}
              <span className="font-semibold" style={{ color: "#2e9e5b" }}>Tổng (xanh)</span>,{" "}
              <span className="font-semibold" style={{ color: "#d9a72e" }}>Mẫu mẹ (vàng)</span>,{" "}
              <span className="font-semibold" style={{ color: "#d9483d" }}>Thành phẩm (đỏ)</span>.
            </li>
            <li>
              Mỗi đường tự phân biệt <span className="font-semibold text-foreground">đã xảy ra</span> (nét
              đậm — sản lượng thực tế) với <span className="font-semibold text-foreground">dự kiến</span>{" "}
              (nét mảnh — NĂNG LỰC tối đa, không phải ngoại suy xu hướng quá khứ). Điểm nối 2 đoạn là kỳ
              hiện tại.
            </li>
            <li>
              Từ kỳ kế tiếp trở đi, phần nét mảnh mô phỏng <span className="font-semibold text-foreground">từng tuần</span>:
              mỗi tuần chỉ Nhóm giàn mẫu mẹ đúng lượt xoay vòng mới được cấy — không phải 1 Nhóm áp dụng
              suốt, mà qua nhiều tuần/tháng lần lượt mọi Nhóm đều tới lượt, mỗi Nhóm tự cộng dồn theo chu
              kỳ riêng.
            </li>
            <li>
              Hệ số nhân MM/ra rễ dùng để tính lấy trung bình{" "}
              <span className="font-semibold text-foreground">3 tuần gần nhất có dữ liệu thật</span> (chỉ
              định thường, không tính dự phòng), cộng dồn các tuần vào đúng kỳ hiển thị tới hết
              &quot;Đến&quot; đã chọn.
            </li>
            <li className="text-text-muted">
              Lưu ý: đoạn nét mảnh có thể lệch mạnh so với đoạn nét đậm vì là 2 khái niệm khác nhau — năng
              lực tối đa nếu tận dụng hết tồn đủ tuổi của mọi Nhóm, không phải xu hướng đã xảy ra.
            </li>
          </ul>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Đơn vị thời gian</Label>
              <Select
                items={[{ value: "week", label: "Tuần" }, { value: "month", label: "Tháng" }]}
                value={unit}
                onValueChange={(v) => { setUnit(v as Unit); setFromPeriod(""); setToPeriod(""); }}
              >
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Tuần</SelectItem>
                  <SelectItem value="month">Tháng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Từ {unit === "week" ? "tuần" : "tháng"}</Label>
              <Input
                type={unit === "week" ? "week" : "month"}
                value={fromPeriod}
                onChange={(e) => setFromPeriod(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đến {unit === "week" ? "tuần" : "tháng"} (có thể chọn tương lai)</Label>
              <div className="flex items-center gap-1">
                <Input
                  type={unit === "week" ? "week" : "month"}
                  value={toPeriod}
                  onChange={(e) => setToPeriod(e.target.value)}
                  className="w-40"
                />
                {(fromPeriod || toPeriod) && (
                  <Button
                    type="button" variant="ghost" size="icon-sm"
                    title="Xoá quãng — dùng mặc định 10 kỳ gần nhất"
                    onClick={() => { setFromPeriod(""); setToPeriod(""); }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Mã sản phẩm</Label>
              <Combobox
                items={plantTypeOptions}
                value={plantTypeOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={setPlantTypeOption}
              >
                <ComboboxInputGroup className="w-56 h-9">
                  <ComboboxInput placeholder="Chọn mã cây…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Phạm vi</Label>
              <Select
                items={[{ value: "all", label: "Toàn hệ thống" }, { value: "warehouse", label: "Theo kho" }, { value: "staff", label: "Theo nhân sự" }]}
                value={scopeKind}
                onValueChange={(v) => { setScopeKind(v as ScopeKind); setScopeOption(null); }}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toàn hệ thống</SelectItem>
                  <SelectItem value="warehouse">Theo kho</SelectItem>
                  <SelectItem value="staff">Theo nhân sự</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scopeKind === "warehouse" && (
              <div className="space-y-1">
                <Label className="text-xs">Kho sản xuất</Label>
                <Combobox
                  items={warehouseOptions}
                  value={scopeOption}
                  isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                  onValueChange={setScopeOption}
                >
                  <ComboboxInputGroup className="w-56 h-9">
                    <ComboboxInput placeholder="Chọn kho…" />
                    <ComboboxTrigger />
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>Không tìm thấy kho</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            )}

            {scopeKind === "staff" && (
              <div className="space-y-1">
                <Label className="text-xs">Nhân sự</Label>
                <Combobox
                  items={staffOptions}
                  value={scopeOption}
                  isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                  onValueChange={setScopeOption}
                >
                  <ComboboxInputGroup className="w-56 h-9">
                    <ComboboxInput placeholder="Chọn NV…" />
                    <ComboboxTrigger />
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                    <ComboboxList>
                      {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!plantTypeOption ? (
          <p className="text-sm text-text-muted text-center py-12">Chọn mã sản phẩm để xem biểu đồ</p>
        ) : loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : (
          <>
            <ReportLineChart
              data={data}
              xKey="period"
              series={[
                { key: "Tổng", label: "Tổng", color: "#2e9e5b", strokeWidth: 3 },
                { key: "Tổng (dự kiến)", label: "Tổng (dự kiến)", color: "#2e9e5b", strokeWidth: 1.5, showInLegend: false },
                { key: "Mẫu mẹ", label: "Mẫu mẹ", color: "#d9a72e", strokeWidth: 3 },
                { key: "Mẫu mẹ (dự kiến)", label: "Mẫu mẹ (dự kiến)", color: "#d9a72e", strokeWidth: 1.5, showInLegend: false },
                { key: "Thành phẩm", label: "Thành phẩm", color: "#d9483d", strokeWidth: 3 },
                { key: "Thành phẩm (dự kiến)", label: "Thành phẩm (dự kiến)", color: "#d9483d", strokeWidth: 1.5, showInLegend: false },
              ]}
              unit=" cây/cụm"
            />

            {staffing.length > 0 && (
              <div className="mt-6 pt-6 border-t border-divider space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="max-w-2xl">
                    <h3 className="font-bold text-primary-strong">Dự đoán theo kịch bản — nhân sự cần</h3>
                    <p className="text-sm text-text-secondary mt-1">
                      Đường &quot;dự kiến&quot; ở biểu đồ trên ngầm giả định không giới hạn nhân sự — mẫu mẹ
                      đến tuổi là được cấy ngay. Bảng dưới quy đổi ngược: cần bao nhiêu ngày công NV cấy để
                      đạt đúng kịch bản đó mỗi kỳ (tổng mẫu mẹ đến tuổi cần cấy ÷ năng suất trung bình 1 NV
                      cấy được bao nhiêu mẫu mẹ/ngày, tính trên 3 tuần gần nhất có dữ liệu thật). Nhập số
                      ngày làm việc thực tế của 1 NV trong kỳ để ra số nhân sự cần.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Số ngày làm việc / kỳ</Label>
                    <Input
                      type="number" min={1}
                      value={workDaysPerStaff}
                      onChange={(e) => setWorkDaysPerStaff(e.target.value)}
                      placeholder="VD: 24"
                      className="w-32"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary-light text-primary-strong">
                        <th className="px-3 py-2 text-left font-bold text-base">Kỳ</th>
                        <th className="px-3 py-2 text-center font-bold text-base">Số ngày cấy cần</th>
                        <th className="px-3 py-2 text-center font-bold text-base">Số nhân sự cần</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffing.map((s) => {
                        const days = Number(workDaysPerStaff);
                        const staffNeeded = days > 0 ? Math.ceil(s.workDaysNeeded / days) : null;
                        return (
                          <tr key={s.period} className="border-b last:border-0 even:bg-primary-light">
                            <td className="px-3 py-2 font-medium">{s.period}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{s.workDaysNeeded.toLocaleString("vi-VN")}</td>
                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-primary-strong">
                              {staffNeeded !== null ? staffNeeded.toLocaleString("vi-VN") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!workDaysPerStaff && (
                    <p className="text-xs text-text-muted mt-2">Nhập số ngày làm việc để tính số nhân sự cần.</p>
                  )}
                </div>

                <div className="pt-4">
                  <h3 className="font-bold text-primary-strong">Dự kiến theo số nhân sự thực tế</h3>
                  <p className="text-sm text-text-secondary mt-1 max-w-2xl">
                    Nhập số nhân sự dự kiến bố trí cho TỪNG kỳ (dùng chung &quot;Số ngày làm việc/kỳ&quot; ở
                    trên) — nếu không đủ người cấy hết số mẫu mẹ đến tuổi trong kỳ, phần còn lại DỒN sang
                    kỳ kế tiếp (không mất, chỉ trễ) và làm giảm số dự kiến của đúng kỳ đó.
                  </p>
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light text-primary-strong">
                          <th className="px-3 py-2 text-left font-bold text-base">Kỳ</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Số nhân sự</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Cần cấy (gồm dồn)</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Đã cấy được</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Dồn sang kỳ sau</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Mẫu mẹ dự kiến</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Thành phẩm dự kiến</th>
                          <th className="px-3 py-2 text-center font-bold text-base">Tổng dự kiến</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cappedRows.map((r) => (
                          <tr key={r.period} className="border-b last:border-0 even:bg-primary-light">
                            <td className="px-3 py-2 font-medium">{r.period}</td>
                            <td className="px-2 py-2">
                              <Input
                                type="number" min={0}
                                value={staffCounts[r.period] ?? ""}
                                onChange={(e) => setStaffCounts((prev) => ({ ...prev, [r.period]: e.target.value }))}
                                className="w-20 text-center mx-auto block [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">{r.need.toLocaleString("vi-VN")}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{r.processed.toLocaleString("vi-VN")}</td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {r.leftover > 0 ? (
                                <span className="text-warning-foreground font-semibold">{r.leftover.toLocaleString("vi-VN")}</span>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "#d9a72e" }}>
                              {r.motherForecast.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "#d9483d" }}>
                              {r.finishedForecast.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: "#2e9e5b" }}>
                              {r.total.toLocaleString("vi-VN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!workDaysPerStaff && (
                      <p className="text-xs text-text-muted mt-2">Nhập &quot;Số ngày làm việc/kỳ&quot; ở trên để tính.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
