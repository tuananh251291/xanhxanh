"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Table2, LineChart as LineChartIcon } from "lucide-react";

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

interface ReportLineChartProps {
  data: Record<string, string | number>[];
  xKey: string;
  series: LineSeries[];
  unit?: string;
  /** Đường tham chiếu ngang, vd ngưỡng cảnh báo */
  referenceValue?: number;
  referenceLabel?: string;
}

export default function ReportLineChart({
  data, xKey, series, unit = "", referenceValue, referenceLabel,
}: ReportLineChartProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div>
      <div className="flex justify-end mb-1">
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? <LineChartIcon className="w-4 h-4 mr-1" /> : <Table2 className="w-4 h-4 mr-1" />}
          {showTable ? "Biểu đồ" : "Bảng số liệu"}
        </Button>
      </div>

      <div style={{ display: showTable ? "none" : "block" }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#898781" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e1e0d9" }}
              formatter={(value, name) => [`${Number(value).toLocaleString("vi-VN")}${unit}`, name]}
            />
            {series.length >= 2 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {referenceValue !== undefined && (
              <ReferenceLine
                y={referenceValue}
                stroke="#c3c2b7"
                strokeDasharray="4 4"
                label={{ value: referenceLabel, position: "insideTopRight", fill: "#898781", fontSize: 11 }}
              />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 4, fill: s.color }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
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
