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
  mother_contamination_alert_pct: {
    label: "Tỉ lệ nhiễm sau ủ sáng",
    description: "% tối đa giữa tổng mẫu mẹ nhiễm cộng dồn và tổng mẫu mẹ được cấp cho chỉ định — vượt ngưỡng này sẽ báo cho Kho mô ngay khi nhân viên cấy mô lưu nhật ký hàng ngày",
    unit: "%",
  },
};

// Ngưỡng an toàn dạng KHOẢNG (từ - đến), khác các tham số đơn ở CONFIG_META phía trên — % tỉ lệ thực tế
// so với tỉ lệ mục tiêu của chỉ định NẰM NGOÀI khoảng này (thấp hơn từ HOẶC cao hơn đến) mới cảnh báo cấy
// lệch chỉ định (cho cả NV cấy mô đang nhập liệu — xem daily-record/page.tsx — lẫn NV kỹ thuật đã tạo chỉ
// định — xem OUTPUT_DEVIATION alert ở api/daily-records/route.ts). Trước đây chỉ có 1 ngưỡng tối thiểu.
const RANGE_CONFIG_META: { minKey: string; maxKey: string; label: string; description: string }[] = [
  {
    minKey: "mother_ratio_min_pct",
    maxKey: "mother_ratio_max_pct",
    label: "Ngưỡng an toàn hệ số nhân mẫu mẹ đạt",
    description: "% tỉ lệ nhân MM thực tế (số cụm mẫu mẹ thành phẩm / số mẫu mẹ đã sử dụng, cộng dồn cả chỉ định) so với tỉ lệ mục tiêu của chỉ định — nằm ngoài khoảng này mới cảnh báo cấy lệch chỉ định",
  },
  {
    minKey: "finished_ratio_min_pct",
    maxKey: "finished_ratio_max_pct",
    label: "Ngưỡng an toàn hệ số ra cây thành phẩm",
    description: "% tỉ lệ ra thành phẩm thực tế (số cây ra rễ thành phẩm / số mẫu mẹ đã sử dụng, cộng dồn cả chỉ định) so với tỉ lệ mục tiêu của chỉ định — nằm ngoài khoảng này mới cảnh báo cấy lệch chỉ định",
  },
];

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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cài đặt hệ thống</h1>
        <p className="text-text-secondary text-sm mt-1">Cấu hình các tham số vận hành</p>
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
              <p className="text-xs text-text-secondary">{meta.description}</p>
              <div className="flex items-center gap-2 max-w-xs">
                <Input
                  type="number"
                  min={1}
                  value={configs[key] ?? ""}
                  onChange={(e) => setConfigs((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-28"
                />
                <span className="text-sm text-text-secondary">{meta.unit}</span>
              </div>
            </div>
          ))}

          {RANGE_CONFIG_META.map((meta) => (
            <div key={meta.minKey} className="space-y-2">
              <Label className="text-sm font-medium">{meta.label}</Label>
              <p className="text-xs text-text-secondary">{meta.description}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">Từ</span>
                <Input
                  type="number"
                  min={0}
                  value={configs[meta.minKey] ?? ""}
                  onChange={(e) => setConfigs((prev) => ({ ...prev, [meta.minKey]: e.target.value }))}
                  className="w-24"
                />
                <span className="text-sm text-text-secondary">% đến</span>
                <Input
                  type="number"
                  min={0}
                  value={configs[meta.maxKey] ?? ""}
                  onChange={(e) => setConfigs((prev) => ({ ...prev, [meta.maxKey]: e.target.value }))}
                  className="w-24"
                />
                <span className="text-sm text-text-secondary">%</span>
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary-hover">
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
