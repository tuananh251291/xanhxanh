"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import ChecklistSettings from "./checklist-settings";

const CONFIG_META: Record<string, { label: string; description: string; unit: string }> = {
  default_hold_days: { label: "Thời gian giữ đơn mặc định", description: "Số ngày sale giữ đơn trước khi hết hạn", unit: "ngày" },
  dark_room_days: { label: "Thời gian lưu phòng tối", description: "Số ngày cây ở phòng tối sau khi cấy", unit: "ngày" },
  contamination_alert_pct: { label: "Ngưỡng cảnh báo tỉ lệ nhiễm", description: "% tỉ lệ nhiễm để kích hoạt cảnh báo tự động", unit: "%" },
  planting_ratio_target_pct: {
    label: "Tỉ lệ cấy cần đạt",
    description: "% tối thiểu giữa sản lượng cấy thực tế và sản lượng cần đạt tính theo tiến độ ngày (dự kiến cả tuần / 6 ngày) — nếu 1 trong các quy cách M03/M05/T05/T01 thấp hơn mức này sẽ cảnh báo lệch chỉ định cấy cho nhân viên kỹ thuật",
    unit: "%",
  },
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { key: string; value: string }[]) => {
        const map: Record<string, string> = {};
        data.forEach(({ key, value }) => { map[key] = value; });
        setConfigs(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = Object.entries(configs).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error("Lưu thất bại"); return; }
      toast.success("Đã lưu cài đặt");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt hệ thống</h1>
        <p className="text-gray-500 text-sm mt-1">Cấu hình các tham số vận hành</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Tham số vận hành
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(CONFIG_META).map(([key, meta]) => (
            <div key={key} className="space-y-2">
              <Label className="text-sm font-medium">{meta.label}</Label>
              <p className="text-xs text-gray-500">{meta.description}</p>
              <div className="flex items-center gap-2 max-w-xs">
                <Input
                  type="number"
                  min={1}
                  value={configs[key] ?? ""}
                  onChange={(e) => setConfigs((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-28"
                />
                <span className="text-sm text-gray-500">{meta.unit}</span>
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Lưu cài đặt
            </Button>
          </div>
        </CardContent>
      </Card>

      <ChecklistSettings />
    </div>
  );
}
