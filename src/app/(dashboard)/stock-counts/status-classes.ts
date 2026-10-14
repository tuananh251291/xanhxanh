import type { STOCK_COUNT_STATUS_LABELS } from "@/lib/stock-count-shared";

export const STOCK_COUNT_STATUS_CLASSES: Record<keyof typeof STOCK_COUNT_STATUS_LABELS, string> = {
  DRAFT: "bg-info-light text-info-foreground",
  SUBMITTED: "bg-warning-light text-warning-foreground",
  RECHECK_REQUESTED: "bg-danger-light text-destructive",
  APPLIED: "bg-primary-light text-primary-strong",
};
