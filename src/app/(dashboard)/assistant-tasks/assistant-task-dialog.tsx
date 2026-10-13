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
  taskDateKey,
  type AssistantTaskCategory,
  type AssistantTaskStatus,
} from "@/lib/assistant-task";
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
};

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
      }
    : { category: "CO_DINH", title: "", responsibleId: "", assignedDate: today, deadline: "", status: "CHUA_LAM", blocker: "" };
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
