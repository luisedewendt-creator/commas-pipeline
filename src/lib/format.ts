import { crmConfig } from "../../config/crm.config.ts";
import type { FollowUpStatus } from "../../shared/types.ts";

export function formatGmv(value: number | null | undefined): string {
  if (value == null) return crmConfig.valueField.empty;
  return `$${value.toLocaleString("en-US")}`;
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function statusLabel(status: FollowUpStatus, dueDate?: string | null): string {
  if (status === "overdue") return "Overdue";
  if (status === "due_today") return "Due today";
  if (status === "upcoming") return dueDate ? formatDate(dueDate) : "Upcoming";
  return "No follow-up";
}

export function stageLabel(stageId: string): string {
  return crmConfig.stages.find((s) => s.id === stageId)?.label ?? stageId;
}

export function stageColor(stageId: string): string {
  return crmConfig.stages.find((s) => s.id === stageId)?.color ?? "#8b919c";
}

export function applyTheme() {
  const t = crmConfig.theme;
  const root = document.documentElement;
  root.style.setProperty("--font", t.font);
  root.style.setProperty("--bg", t.background);
  root.style.setProperty("--surface", t.surface);
  root.style.setProperty("--text", t.text);
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent-text", t.accentText);
  root.style.setProperty("--muted", t.muted);
  root.style.setProperty("--border", t.border);
  root.style.setProperty("--danger", t.danger);
  root.style.setProperty("--warning", t.warning);
  root.style.setProperty("--success", t.success);
  root.style.setProperty("--radius", t.radius);
  document.title = crmConfig.appName;
}
