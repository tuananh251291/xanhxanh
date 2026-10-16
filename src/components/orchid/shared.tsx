import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

// Thành phần hiển thị dùng được ở server component.

export function OrchidPageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && <p className="text-text-secondary text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  default: "text-foreground",
  primary: "text-primary-strong",
  warning: "text-warning-foreground",
  danger: "text-destructive",
  info: "text-info-foreground",
  violet: "text-violet-foreground",
};

export function StatCard({ label, value, sub, tone = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: keyof typeof TONE }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className={cn("text-xl font-bold mt-1 tabular-nums", TONE[tone])}>{value}</p>
        {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function EmptyRow({ colSpan, text = "Chưa có dữ liệu" }: { colSpan: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-text-muted">{text}</td>
    </tr>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-primary-strong">{children}</h2>;
}
