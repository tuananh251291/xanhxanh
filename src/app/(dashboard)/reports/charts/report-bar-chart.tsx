"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Table2, BarChart3 } from "lucide-react";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface ColorThreshold {
  min: number;
  color: string;
}

interface ReportBarChartProps {
  data: Record<string, string | number>[];
  xKey: string;
  series: BarSeries[];
  unit?: string;
  /** Tô màu từng cột theo giá trị (dùng khi chỉ có 1 series nhưng cần màu trạng thái, vd tỉ lệ nhiễm).
   *  Danh sách ngưỡng, xét từ min cao nhất trở xuống; ngưỡng đầu tiên value >= min sẽ được dùng. */
  colorThresholds?: ColorThreshold[];
}

function colorForValue(value: number, thresholds: ColorThreshold[]): string | undefined {
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  return sorted.find((t) => value >= t.min)?.color;
}

export default function ReportBarChart({ data, xKey, series, unit = "", colorThresholds }: ReportBarChartProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div>
      <div className="flex justify-end mb-1">
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? <BarChart3 className="w-4 h-4 mr-1" /> : <Table2 className="w-4 h-4 mr-1" />}
          {showTable ? "Biểu đồ" : "Bảng số liệu"}
        </Button>
      </div>

      <div style={{ display: showTable ? "none" : "block" }}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#898781" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e1e0d9" }}
              formatter={(value, name) => [`${Number(value).toLocaleString("vi-VN")}${unit}`, name]}
            />
            {series.length >= 2 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40}>
                {colorThresholds && series.length === 1 &&
                  data.map((d, i) => <Cell key={i} fill={colorForValue(Number(d[s.key]), colorThresholds)} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: showTable ? "block" : "none" }} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-background">
              <th className="text-left px-3 py-2 text-text-secondary font-bold text-base">{xKey}</th>
              {series.map((s) => (
                <th key={s.key} className="text-right px-3 py-2 font-medium text-text-secondary">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b">
                <td className="px-3 py-2">{row[xKey]}</td>
                {series.map((s) => (
                  <td key={s.key} className="text-right px-3 py-2 tabular-nums">
                    {Number(row[s.key]).toLocaleString("vi-VN")}{unit}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
