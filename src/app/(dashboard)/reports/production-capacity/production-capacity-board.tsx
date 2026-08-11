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
type Spec = "total" | "mother" | "finished";
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
  const [spec, setSpec] = useState<Spec>("total");
  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [scopeOption, setScopeOption] = useState<ComboOption | null>(null);
  // Quãng thời gian tự nhập (tuỳ chọn) — để trống cả 2 thì API tự dùng mặc định 10 kỳ gần nhất + 1 kỳ
  // kế tiếp. Nhập theo ĐÚNG đơn vị đang chọn (tuần ISO qua <input type="week">, tháng qua
  // <input type="month">) — không hiện ngày trực tiếp. "Đến" có thể chọn ở tương lai để kéo dài đường đỏ
  // dự báo tới hết kỳ đó (xem production-capacity/route.ts).
  const [fromPeriod, setFromPeriod] = useState("");
  const [toPeriod, setToPeriod] = useState("");

  const [data, setData] = useState<Record<string, string | number>[]>([]);
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
      const params = new URLSearchParams({ unit, plantTypeId: plantTypeOption.value, spec, scope: scopeKind });
      if (scopeKind !== "all" && scopeOption) params.set("scopeId", scopeOption.value);
      const fromStr = periodValueToDateStr(fromPeriod, unit);
      const toStr = periodValueToDateStr(toPeriod, unit);
      if (fromStr && toStr) { params.set("from", fromStr); params.set("to", toStr); }
      const res = await fetch(`/api/reports/production-capacity?${params}`);
      const json = await res.json();
      setData(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, [unit, plantTypeOption, spec, scopeKind, scopeOption, fromPeriod, toPeriod]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <p className="text-sm text-text-secondary max-w-md">
            Đường xanh: sản lượng thực tế tới kỳ hiện tại. Đường đỏ: dự kiến, nối liền từ đường xanh và
            kéo dài tới hết &quot;Đến&quot; đã chọn (chọn &quot;Đến&quot; ở tương lai để xem xa hơn) — tính
            từ tồn mẫu mẹ hiện có × hệ số nhân MM/ra rễ trung bình 3 kỳ gần nhất (chỉ định thường, không
            tính dự phòng), giữ nguyên 1 mức cho mọi kỳ tương lai.
          </p>
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
              <Label className="text-xs">Quy cách</Label>
              <Select
                items={[{ value: "total", label: "Tổng" }, { value: "mother", label: "Mẫu mẹ" }, { value: "finished", label: "Thành phẩm" }]}
                value={spec}
                onValueChange={(v) => setSpec(v as Spec)}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Tổng</SelectItem>
                  <SelectItem value="mother">Mẫu mẹ</SelectItem>
                  <SelectItem value="finished">Thành phẩm</SelectItem>
                </SelectContent>
              </Select>
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
          <ReportLineChart
            data={data}
            xKey="period"
            series={[
              { key: "Thực tế", label: "Thực tế", color: "#2e9e5b" },
              { key: "Dự kiến", label: "Dự kiến", color: "#d9483d" },
            ]}
            unit=" cây/cụm"
          />
        )}
      </CardContent>
    </Card>
  );
}
