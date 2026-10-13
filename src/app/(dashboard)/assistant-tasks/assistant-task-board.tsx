"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_TASK_CATEGORY_LABELS,
  ASSISTANT_TASK_STATUS_LABELS,
  ASSISTANT_TASK_TONE_CLASSES,
  ASSISTANT_TASK_TONE_LABELS,
  describeAssistantTask,
  taskDateKey,
  type AssistantTaskCategory,
  type AssistantTaskStatus,
  type AssistantTaskTone,
} from "@/lib/assistant-task";
import AssistantTaskDialog, { type StaffOption, type TaskFormValues } from "./assistant-task-dialog";

export type AssistantTaskRow = {
  id: string;
  category: AssistantTaskCategory;
  title: string;
  responsibleId: string;
  responsible: { id: string; name: string; code: string };
  assignedDate: string;
  deadline: string;
  status: AssistantTaskStatus;
  completedAt: string | null;
  blocker: string | null;
};

const TONE_ORDER: AssistantTaskTone[] = ["overdue", "due-soon", "in-progress", "done"];
const ALL = "ALL";
const fmtDay = (key: string) => format(new Date(`${key}T00:00:00`), "dd/MM/yyyy");

export default function AssistantTaskBoard({ staffOptions }: { staffOptions: StaffOption[] }) {
  const [tasks, setTasks] = useState<AssistantTaskRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [tone, setTone] = useState<AssistantTaskTone | null>(null);
  const [editing, setEditing] = useState<AssistantTaskRow | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/assistant-tasks")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: AssistantTaskRow[]) => setTasks(data))
      .catch(() => { toast.error("Không tải được danh sách công việc"); setTasks([]); });
  }, []);

  const described = useMemo(
    () => (tasks ?? []).map((t) => ({ task: t, info: describeAssistantTask(t) })),
    [tasks]
  );
  const countByTone = useMemo(() => {
    const c: Record<AssistantTaskTone, number> = { overdue: 0, "due-soon": 0, "in-progress": 0, done: 0 };
    for (const d of described) c[d.info.tone]++;
    return c;
  }, [described]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return described
      .filter(({ task, info }) =>
        (category === ALL || task.category === category) &&
        (!tone || info.tone === tone) &&
        (!q || task.title.toLowerCase().includes(q) || task.responsible.name.toLowerCase().includes(q) || task.responsible.code.toLowerCase().includes(q))
      )
      // Việc cần chú ý lên đầu (trễ → sắp đến hạn → đang xử lý → hoàn thành), cùng nhóm thì theo deadline.
      .sort((a, b) =>
        TONE_ORDER.indexOf(a.info.tone) - TONE_ORDER.indexOf(b.info.tone) ||
        (a.info.tone === "done" ? b.task.deadline.localeCompare(a.task.deadline) : a.task.deadline.localeCompare(b.task.deadline))
      );
  }, [described, search, category, tone]);

  const save = async (values: TaskFormValues, id?: string) => {
    const res = await fetch(id ? `/api/assistant-tasks/${id}` : "/api/assistant-tasks", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.message ?? "Lưu thất bại"); return false; }
    toast.success(id ? "Đã cập nhật công việc" : "Đã thêm công việc");
    setTasks((prev) => (id ? (prev ?? []).map((t) => (t.id === id ? json : t)) : [...(prev ?? []), json]));
    return true;
  };

  const changeStatus = async (task: AssistantTaskRow, status: AssistantTaskStatus) => {
    if (status === task.status) return;
    setBusyId(task.id);
    await save({ status } as TaskFormValues, task.id);
    setBusyId(null);
  };

  const remove = async (task: AssistantTaskRow) => {
    if (!confirm(`Xoá công việc "${task.title}"?`)) return;
    setBusyId(task.id);
    const res = await fetch(`/api/assistant-tasks/${task.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) { toast.error("Xoá thất bại"); return; }
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
    toast.success("Đã xoá công việc");
  };

  return (
    <div className="space-y-4">
      {/* Quy ước phân loại — bấm để lọc nhanh theo nhóm */}
      <div className="flex flex-wrap gap-2">
        {(["in-progress", "due-soon", "overdue", "done"] as AssistantTaskTone[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTone(tone === t ? null : t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold border transition",
              ASSISTANT_TASK_TONE_CLASSES[t],
              tone === t ? "border-foreground/40 ring-2 ring-ring/40" : "border-transparent opacity-90 hover:opacity-100"
            )}
          >
            {ASSISTANT_TASK_TONE_LABELS[t]} · {countByTone[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-9 w-64" placeholder="Tìm công việc hoặc người phụ trách…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select items={{ [ALL]: "Tất cả phân loại", ...ASSISTANT_TASK_CATEGORY_LABELS }} value={category} onValueChange={(v) => setCategory(v as string)}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả phân loại</SelectItem>
            {Object.entries(ASSISTANT_TASK_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setEditing("new")}>
          <Plus className="w-4 h-4" /> Thêm công việc
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {tasks === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="w-5 h-5 animate-spin" /> Đang tải…</div>
          ) : rows.length === 0 ? (
            <p className="text-center text-text-muted py-10">{tasks.length === 0 ? "Chưa có công việc nào — bấm \"Thêm công việc\"." : "Không có công việc khớp bộ lọc."}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-primary-light">
                <tr>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Phân loại</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold min-w-56">Công việc</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Người chịu trách nhiệm</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Ngày bàn giao</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Deadline</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Còn lại / Trễ</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Trạng thái</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold min-w-40">Vướng mắc</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Nhắc nhở</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ task, info }) => (
                  <tr key={task.id} className="border-b border-divider last:border-0 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge className={task.category === "CO_DINH" ? "bg-secondary/20 text-secondary-foreground" : "bg-violet-light text-violet-foreground"}>
                        {ASSISTANT_TASK_CATEGORY_LABELS[task.category]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-pre-wrap text-foreground">{task.title}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{task.responsible.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(taskDateKey(task.assignedDate))}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDay(taskDateKey(task.deadline))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge className={ASSISTANT_TASK_TONE_CLASSES[info.tone]}>{info.remainingLabel}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        items={ASSISTANT_TASK_STATUS_LABELS}
                        value={task.status}
                        onValueChange={(v) => changeStatus(task, v as AssistantTaskStatus)}
                        disabled={busyId === task.id}
                      >
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(ASSISTANT_TASK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 whitespace-pre-wrap text-text-secondary">{task.blocker || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={cn("font-semibold", info.tone === "overdue" ? "text-destructive" : info.tone === "due-soon" ? "text-warning-foreground" : "text-text-secondary")}>
                        {info.reminderLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" title="Sửa" onClick={() => setEditing(task)} disabled={busyId === task.id}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Xoá" onClick={() => remove(task)} disabled={busyId === task.id}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AssistantTaskDialog
        open={editing !== null}
        task={editing === "new" ? null : editing}
        staffOptions={staffOptions}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          const ok = await save(values, editing && editing !== "new" ? editing.id : undefined);
          if (ok) setEditing(null);
        }}
      />
    </div>
  );
}
