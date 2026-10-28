"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  ASSISTANT_TASK_CATEGORY_LABELS,
  ASSISTANT_TASK_STATUS_LABELS,
  ASSISTANT_TASK_REPEAT_LABELS,
  ASSISTANT_TASK_WEEKDAY_LABELS,
  taskDateKey,
  type AssistantTaskCategory,
  type AssistantTaskRepeat,
  type AssistantTaskStatus,
} from "@/lib/assistant-task";
import { cn } from "@/lib/utils";
import type { AssistantTaskRow } from "./assistant-task-board";

export type StaffOption = { value: string; label: string };
export type TaskFormValues = {
  category: AssistantTaskCategory;
  title: string;
  responsibleId: string;
  assignedDate: string;
  deadline: string;
  status: AssistantTaskStatus;
  blocker: string;
  repeat: AssistantTaskRepeat;
  repeatWeekdays: number[];
};

// 1 = Thứ 2 … 7 = Chủ nhật của 1 ngày "yyyy-MM-dd".
const isoWeekday = (key: string) => ((new Date(`${key}T00:00:00`).getDay() + 6) % 7) + 1;

function repeatHint(v: TaskFormValues): string {
  const day = v.assignedDate ? v.assignedDate.slice(8, 10) : "—";
  switch (v.repeat) {
    case "DAILY": return "Lặp mỗi ngày.";
    case "WEEKLY": {
      const days = ASSISTANT_TASK_WEEKDAY_LABELS.filter((d) => v.repeatWeekdays.includes(d.value)).map((d) => d.label);
      return days.length ? `Lặp vào ${days.join(", ")} hằng tuần.` : "Chọn ngày lặp trong tuần.";
    }
    case "MONTHLY": return `Lặp vào ngày ${day} hằng tháng (theo ngày bàn giao).`;
    case "YEARLY": return `Lặp vào ngày ${day}/${v.assignedDate ? v.assignedDate.slice(5, 7) : "—"} hằng năm.`;
    default: return "";
  }
}

const textareaClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function initialValues(task: AssistantTaskRow | null): TaskFormValues {
  const today = format(new Date(), "yyyy-MM-dd");
  return task
    ? {
        category: task.category,
        title: task.title,
        responsibleId: task.responsibleId,
        assignedDate: taskDateKey(task.assignedDate),
        deadline: taskDateKey(task.deadline),
        status: task.status,
        blocker: task.blocker ?? "",
        repeat: task.repeat ?? "NONE",
        repeatWeekdays: task.repeatWeekdays ?? [],
      }
    : { category: "CO_DINH", title: "", responsibleId: "", assignedDate: today, deadline: "", status: "CHUA_LAM", blocker: "", repeat: "NONE", repeatWeekdays: [] };
}

export default function AssistantTaskDialog({
  open,
  task,
  staffOptions,
  onClose,
  onSave,
}: {
  open: boolean;
  task: AssistantTaskRow | null;
  staffOptions: StaffOption[];
  onClose: () => void;
  onSave: (values: TaskFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TaskFormValues>(() => initialValues(task));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Mở lại hộp thoại (thêm mới hoặc sửa dòng khác) → nạp lại giá trị ban đầu.
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = open ? (task?.id ?? "new") : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) { setValues(initialValues(task)); setError(""); }
  }

  const set = <K extends keyof TaskFormValues>(k: K, v: TaskFormValues[K]) => setValues((p) => ({ ...p, [k]: v }));
  const selectedStaff = staffOptions.find((o) => o.value === values.responsibleId) ?? null;

  const submit = async () => {
    if (!values.title.trim()) return setError("Nhập công việc");
    if (!values.responsibleId) return setError("Chọn người chịu trách nhiệm");
    if (!values.assignedDate || !values.deadline) return setError("Chọn ngày bàn giao và deadline");
    if (values.deadline < values.assignedDate) return setError("Deadline không được trước ngày bàn giao");
    if (values.repeat === "WEEKLY" && values.repeatWeekdays.length === 0) return setError("Chọn ít nhất 1 ngày lặp trong tuần");
    setError("");
    setSaving(true);
    await onSave(values);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Sửa công việc" : "Thêm công việc"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phân loại</Label>
              <Select items={ASSISTANT_TASK_CATEGORY_LABELS} value={values.category} onValueChange={(v) => set("category", v as AssistantTaskCategory)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSISTANT_TASK_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Trạng thái</Label>
              <Select items={ASSISTANT_TASK_STATUS_LABELS} value={values.status} onValueChange={(v) => set("status", v as AssistantTaskStatus)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSISTANT_TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Công việc</Label>
            <textarea rows={3} className={textareaClass} placeholder="Nhập nội dung công việc…" value={values.title} onChange={(e) => set("title", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Người chịu trách nhiệm</Label>
            <Combobox
              items={staffOptions}
              value={selectedStaff}
              isItemEqualToValue={(a: StaffOption, b: StaffOption) => a.value === b.value}
              onValueChange={(v) => set("responsibleId", (v as StaffOption | null)?.value ?? "")}
            >
              <ComboboxInputGroup>
                <ComboboxInput placeholder="Gõ tên hoặc mã nhân sự…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy nhân sự</ComboboxEmpty>
                <ComboboxList>
                  {(item: StaffOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ngày bàn giao</Label>
              <Input type="date" value={values.assignedDate} onChange={(e) => set("assignedDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Deadline</Label>
              <Input type="date" value={values.deadline} min={values.assignedDate || undefined} onChange={(e) => set("deadline", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Lặp lại</Label>
            <Select
              items={ASSISTANT_TASK_REPEAT_LABELS}
              value={values.repeat}
              onValueChange={(v) => {
                const repeat = v as AssistantTaskRepeat;
                // Chọn Hằng tuần lần đầu → mặc định đúng thứ của ngày bàn giao.
                setValues((p) => ({
                  ...p,
                  repeat,
                  repeatWeekdays: repeat === "WEEKLY" && p.repeatWeekdays.length === 0 && p.assignedDate ? [isoWeekday(p.assignedDate)] : p.repeatWeekdays,
                }));
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ASSISTANT_TASK_REPEAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {values.repeat === "WEEKLY" && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ASSISTANT_TASK_WEEKDAY_LABELS.map((d) => {
                  const on = values.repeatWeekdays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => set("repeatWeekdays", on ? values.repeatWeekdays.filter((x) => x !== d.value) : [...values.repeatWeekdays, d.value].sort())}
                      className={cn(
                        "h-8 min-w-10 px-2 rounded-md border text-sm font-medium transition-colors",
                        on ? "bg-primary-light border-primary text-primary-strong" : "bg-card border-border text-text-secondary hover:bg-primary-light/40"
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
            {values.repeat !== "NONE" && (
              <p className="text-xs text-text-secondary">
                {repeatHint(values)} Đến kỳ tiếp theo hệ thống tự tạo công việc mới giống công việc này — ngày bàn giao &amp; deadline dời
                sang kỳ đó, công việc kỳ trước giữ nguyên.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Vướng mắc</Label>
            <textarea rows={2} className={textareaClass} placeholder="Không bắt buộc" value={values.blocker} onChange={(e) => set("blocker", e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
