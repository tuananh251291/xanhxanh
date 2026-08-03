"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, PenLine } from "lucide-react";
import { format, addDays, isSameDay, startOfWeek } from "date-fns";
import EditDailyRecordDialog from "../instructions/edit-daily-record-dialog";
import AddDailyRecordDialog from "../instructions/add-daily-record-dialog";

type Instruction = {
  id: string;
  code: string;
  plantType: { name: string; code: string };
  weekStart: string | null;
  assignedTo: { name: string } | null;
};

type RecordItem = { stage: "MAU_ME" | "THANH_PHAM"; quantityCreated: number; lot: { stageCode: string } };
type DailyRecord = {
  id: string;
  recordDate: string;
  motherUsed: number;
  motherChecked: number;
  motherContaminatedM05: number;
  items: RecordItem[];
};

const DAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("vi-VN"));

// Bản sao "chỉ đọc + sửa qua dialog" của bảng nhập liệu ở (dashboard)/daily-record/page.tsx (NV cấy mô tự
// nhập) — cùng cột, cùng cách gộp M05/T05/T01, nhưng KHÔNG giới hạn "chỉ hôm nay mới nhập được" như bên
// đó. Việc sửa/bù dữ liệu dùng lại NGUYÊN VẸN EditDailyRecordDialog/AddDailyRecordDialog (đã dùng ở
// /instructions/[id]) thay vì viết lại — 2 dialog đó đã xử lý đủ ràng buộc an toàn (khoá khi lô đã bị
// động tới nơi khác qua bàn giao/kiểm tra nhiễm, chỉ cho bù dữ liệu ngày còn thiếu trong TUẦN HIỆN TẠI).
export default function DailyRecordEditBoard() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Instruction[]>([]);
  const [selected, setSelected] = useState<Instruction | null>(null);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [searched, setSearched] = useState(false);

  const loadRecords = useCallback(async (instructionId: string) => {
    setLoadingRecords(true);
    try {
      const res = await fetch(`/api/daily-records?instructionId=${instructionId}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const pick = useCallback(async (inst: Instruction) => {
    setSelected(inst);
    await loadRecords(inst.id);
  }, [loadRecords]);

  const search = async () => {
    const code = query.trim();
    if (!code) return;
    setSearching(true);
    setSearched(false);
    setSelected(null);
    setRecords([]);
    try {
      const res = await fetch(`/api/instructions?code=${encodeURIComponent(code)}`);
      const data: Instruction[] = await res.json();
      const list = Array.isArray(data) ? data : [];
      setMatches(list);
      setSearched(true);
      // Khớp CHÍNH XÁC (không phân biệt hoa/thường) thì tự chọn luôn — gõ đủ mã thật thì vào bảng ngay,
      // không bắt phải bấm thêm 1 lần nữa. Chỉ khi mã gõ không khớp tuyệt đối và có nhiều kết quả gần
      // đúng mới cần NV tự chọn.
      const exact = list.find((i) => i.code.toLowerCase() === code.toLowerCase());
      if (exact) await pick(exact);
      else if (list.length === 1) await pick(list[0]);
    } finally {
      setSearching(false);
    }
  };

  const weekStart = selected?.weekStart ? startOfWeek(new Date(selected.weekStart), { weekStartsOn: 1 }) : null;
  const days = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];
  const today = new Date();
  const isCurrentWeek = !!weekStart && isSameDay(weekStart, startOfWeek(today, { weekStartsOn: 1 }));

  const recordForDay = (day: Date) => records.find((r) => isSameDay(new Date(r.recordDate), day));
  const rowValues = (rec: DailyRecord) => {
    const sum = (code: string) => rec.items.filter((i) => i.lot.stageCode === code).reduce((s, i) => s + i.quantityCreated, 0);
    return {
      motherChecked: rec.motherChecked,
      motherContaminatedM05: rec.motherContaminatedM05,
      motherUsed: rec.motherUsed,
      m05: sum("M05"),
      t05: sum("T05"),
      t01: sum("T01"),
    };
  };
  const totals = records.reduce(
    (acc, rec) => {
      const v = rowValues(rec);
      acc.motherChecked += v.motherChecked;
      acc.motherContaminatedM05 += v.motherContaminatedM05;
      acc.motherUsed += v.motherUsed;
      acc.m05 += v.m05;
      acc.t05 += v.t05;
      acc.t01 += v.t01;
      return acc;
    },
    { motherChecked: 0, motherContaminatedM05: 0, motherUsed: 0, m05: 0, t05: 0, t01: 0 }
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PenLine className="w-6 h-6 text-primary-strong" /> Sửa cập nhật dữ liệu cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhập mã chỉ định cấy để xem và sửa lại nhật ký cấy hàng ngày NV cấy mô đã điền
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 max-w-md">
            <Input
              placeholder="VD: CDAA01C05201026"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button onClick={search} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {searched && matches.length === 0 && (
            <p className="text-sm text-text-muted mt-3">Không tìm thấy chỉ định nào khớp mã này.</p>
          )}

          {searched && matches.length > 1 && (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-text-secondary">Tìm thấy {matches.length} chỉ định — chọn đúng chỉ định:</p>
              {matches.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => pick(inst)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-md border ${
                    selected?.id === inst.id ? "border-primary bg-primary-light" : "border-divider hover:bg-muted"
                  }`}
                >
                  <span className="font-mono">{inst.code}</span> — {inst.plantType.name}
                  {inst.assignedTo && <span className="text-text-secondary"> · NV {inst.assignedTo.name}</span>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected.code} — {selected.plantType.name}
              {selected.assignedTo && <span className="font-normal text-text-secondary text-sm"> · NV {selected.assignedTo.name}</span>}
            </CardTitle>
            {weekStart && (
              <p className="text-xs text-text-secondary">
                Tuần {format(weekStart, "dd/MM")} – {format(addDays(weekStart, 6), "dd/MM")}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {loadingRecords ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
            ) : !weekStart ? (
              <p className="text-sm text-text-muted text-center py-6">Chỉ định chưa có Tuần thực hiện.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light text-primary-strong">
                      <th className="px-3 py-2 text-left whitespace-nowrap font-bold text-base">Ngày</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM nhiễm (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM sử dụng (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">MM đã kiểm tra (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">M05 (cụm)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">T05 (cây)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">T01 (cây)</th>
                      <th className="px-3 py-2 text-right font-bold text-base">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, idx) => {
                      const rec = recordForDay(day);
                      const values = rec ? rowValues(rec) : null;
                      const isToday = isSameDay(day, today);
                      // Chỉ được BÙ MỚI (chưa có bản ghi) khi ngày thuộc tuần hiện tại, không sau hôm nay,
                      // và chỉ định đã có NV được gán — khớp đúng ràng buộc server ở POST /api/daily-records
                      // (nhánh Admin/KHO_MO bù hộ), tránh bấm được nút rồi mới báo lỗi.
                      const canAdd = !rec && isCurrentWeek && day <= today && !!selected.assignedTo;
                      return (
                        <tr key={day.toISOString()} className={`border-b ${isToday ? "bg-primary-light" : idx % 2 === 0 ? "bg-primary-light/60" : "bg-white"}`}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {DAY_LABELS[idx]} - {format(day, "dd/MM")}
                            {isToday && <span className="ml-1 text-xs text-primary-strong">(hôm nay)</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherContaminatedM05) : "—"}</td>
                          <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherUsed) : "—"}</td>
                          <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.motherChecked) : "—"}</td>
                          <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.m05) : "—"}</td>
                          <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.t05) : "—"}</td>
                          <td className="px-3 py-2 text-right text-foreground">{values ? fmt(values.t01) : "—"}</td>
                          <td className="px-3 py-2 text-right">
                            {rec ? (
                              <EditDailyRecordDialog recordId={rec.id} onSaved={() => loadRecords(selected.id)} />
                            ) : canAdd ? (
                              <AddDailyRecordDialog
                                instructionId={selected.id}
                                date={day}
                                staffName={selected.assignedTo!.name}
                                onSaved={() => loadRecords(selected.id)}
                              />
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {records.length > 0 && (
                      <tr className="border-b bg-info-light font-semibold">
                        <td className="px-3 py-2">Tổng cả tuần</td>
                        <td className="px-3 py-2 text-right">{fmt(totals.motherContaminatedM05)}</td>
                        <td className="px-3 py-2 text-right">{fmt(totals.motherUsed)}</td>
                        <td className="px-3 py-2 text-right">{fmt(totals.motherChecked)}</td>
                        <td className="px-3 py-2 text-right">{fmt(totals.m05)}</td>
                        <td className="px-3 py-2 text-right">{fmt(totals.t05)}</td>
                        <td className="px-3 py-2 text-right">{fmt(totals.t01)}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
