import { crmConfig } from "../config/crm.config.ts";
import type { Deal, PlannedFollowUp, PlanReason, Task } from "../shared/types.ts";

export const CADENCE_TZ = crmConfig.cadence.timezone || "America/New_York";

export function formatYmdInZone(date: Date, timeZone = CADENCE_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

export function todayYmd(now: Date = new Date(), timeZone = CADENCE_TZ): string {
  return formatYmdInZone(now, timeZone);
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function addCalendarDays(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayIndex(ymd: string): number {
  return parseYmd(ymd).getUTCDay();
}

export function isWeekend(ymd: string): boolean {
  const day = weekdayIndex(ymd);
  return day === 0 || day === 6;
}

/** Move Saturday or Sunday to the following Monday. */
export function bumpWeekend(ymd: string, enabled = crmConfig.cadence.weekendToMonday): string {
  if (!enabled) return ymd;
  const day = weekdayIndex(ymd);
  if (day === 6) return addCalendarDays(ymd, 2);
  if (day === 0) return addCalendarDays(ymd, 1);
  return ymd;
}

/**
 * Add N business days (Mon-Fri) to a calendar date.
 * N = 0 means "same business day": weekdays stay put, weekends move to Monday.
 */
export function addBusinessDays(ymd: string, days: number): string {
  if (days < 0) return ymd;
  if (days === 0) return bumpWeekend(ymd);
  let cursor = ymd;
  let added = 0;
  while (added < days) {
    cursor = addCalendarDays(cursor, 1);
    if (!isWeekend(cursor)) added += 1;
  }
  return cursor;
}

export function getStage(stageId: string) {
  return crmConfig.stages.find((s) => s.id === stageId);
}

export function isClosedLost(stageId: string): boolean {
  return getStage(stageId)?.closed === "lost";
}

export function isClosedWon(stageId: string): boolean {
  return getStage(stageId)?.closed === "won";
}

export function followUpStatus(dueDate: string | null | undefined, today: string) {
  if (!dueDate) return "none" as const;
  if (dueDate < today) return "overdue" as const;
  if (dueDate === today) return "due_today" as const;
  return "upcoming" as const;
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const ms = parseYmd(toYmd).getTime() - parseYmd(fromYmd).getTime();
  return Math.round(ms / 86_400_000);
}

function stageDays(stageId: string): number {
  const override = crmConfig.cadence.byStage[stageId];
  if (typeof override === "number") return override;
  return crmConfig.cadence.defaultDays;
}

function dayBefore(ymd: string): string {
  return addCalendarDays(ymd, -1);
}

export function planFollowUp(
  deal: Pick<Deal, "stage" | "meetingDate" | "reengagementDate">,
  reason: PlanReason,
  date: string,
): PlannedFollowUp | null {
  const stage = deal.stage;

  if (reason === "reengage") {
    if (!deal.reengagementDate) return null;
    return { dueDate: deal.reengagementDate, title: "Re-engage" };
  }

  if (reason === "no_show") {
    return { dueDate: addBusinessDays(date, 0), title: "No-show outreach" };
  }

  if (reason === "new_deal") {
    return { dueDate: addBusinessDays(date, 0), title: "First outreach" };
  }

  if (stage === "lost" || isClosedLost(stage)) {
    return null;
  }

  if (stage === "live" || isClosedWon(stage)) {
    if (reason === "stage_enter" && crmConfig.cadence.liveCheckInOnce) {
      return {
        dueDate: addBusinessDays(date, stageDays("live")),
        title: "Check in",
      };
    }
    return null;
  }

  if (stage === "approved") {
    const offset =
      reason === "stage_enter"
        ? crmConfig.cadence.approvedEnterDays
        : stageDays("approved");
    return {
      dueDate: addBusinessDays(date, offset),
      title: "Follow up to launch",
    };
  }

  if (stage === "underwriting") {
    return {
      dueDate: addBusinessDays(date, stageDays("underwriting")),
      title: "Internal status check",
    };
  }

  if (stage === "meeting") {
    if (deal.meetingDate) {
      return {
        dueDate: dayBefore(deal.meetingDate),
        title: "Meeting reminder",
      };
    }
    return {
      dueDate: addBusinessDays(date, 0),
      title: "Confirm meeting time",
    };
  }

  if (stage === "onboarding") {
    return {
      dueDate: addBusinessDays(date, stageDays("onboarding")),
      title: "Follow up on documents",
    };
  }

  const days = stageDays(stage);
  if (days < 0) return null;

  const titles: Record<string, string> = {
    lead: "Follow up",
    contacted: "Follow up",
    qualified: "Follow up",
  };

  return {
    dueDate: addBusinessDays(date, days),
    title: titles[stage] ?? "Follow up",
  };
}

export interface MutableStore {
  tasks: Task[];
}

function openTasksForDeal(store: MutableStore, dealId: string): Task[] {
  return store.tasks.filter((t) => t.dealId === dealId && !t.done);
}

function markDone(task: Task, atIso: string) {
  task.done = true;
  task.doneAt = atIso;
}

/**
 * Apply a planned follow-up without touching a remaining pinned open task.
 * If an unpinned open task exists, move it. Close extras. Create if needed.
 */
export function applyPlannedFollowUp(
  store: MutableStore,
  dealId: string,
  planned: PlannedFollowUp | null,
  atIso: string,
  opts: { respectPinned?: boolean } = {},
): Task | null {
  const respectPinned = opts.respectPinned !== false;
  const open = openTasksForDeal(store, dealId);
  const pinned = open.filter((t) => t.pinned);
  const unpinned = open.filter((t) => !t.pinned);

  if (respectPinned && pinned.length > 0) {
    for (const extra of unpinned) markDone(extra, atIso);
    for (const extra of pinned.slice(1)) markDone(extra, atIso);
    return pinned[0];
  }

  if (!planned) {
    for (const extra of open) markDone(extra, atIso);
    return null;
  }

  const keep = unpinned[0] ?? pinned[0];
  if (keep) {
    keep.title = planned.title;
    keep.dueDate = planned.dueDate;
    if (!keep.pinned) keep.pinned = false;
    for (const extra of open.filter((t) => t.id !== keep.id)) markDone(extra, atIso);
    return keep;
  }

  const created: Task = {
    id: crypto.randomUUID(),
    dealId,
    title: planned.title,
    dueDate: planned.dueDate,
    done: false,
    doneAt: null,
    pinned: false,
  };
  store.tasks.push(created);
  return created;
}

/**
 * Called whenever a message or call is logged.
 * 1. Marks open tasks due on or before `date` as done.
 * 2. Leaves exactly one open follow-up, unless a pinned future task already
 *    exists (agreed dates are never overwritten) or the stage creates none.
 */
export function settleOnContactInStore(
  store: MutableStore,
  deal: Deal,
  date: string,
  atIso: string = new Date().toISOString(),
): Task | null {
  const open = openTasksForDeal(store, deal.id);
  for (const task of open) {
    if (task.dueDate <= date) markDone(task, atIso);
  }

  const remaining = openTasksForDeal(store, deal.id);
  const pinnedFuture = remaining.find((t) => t.pinned);
  if (pinnedFuture) {
    for (const extra of remaining.filter((t) => t.id !== pinnedFuture.id)) {
      markDone(extra, atIso);
    }
    return pinnedFuture;
  }

  const planned = planFollowUp(deal, "contact", date);
  return applyPlannedFollowUp(store, deal.id, planned, atIso, { respectPinned: true });
}

export function replanOnStageChangeInStore(
  store: MutableStore,
  deal: Deal,
  date: string,
  atIso: string = new Date().toISOString(),
): Task | null {
  const planned = planFollowUp(deal, "stage_enter", date);
  return applyPlannedFollowUp(store, deal.id, planned, atIso, { respectPinned: true });
}

export function nextOpenTask(store: MutableStore, dealId: string): Task | null {
  const open = openTasksForDeal(store, dealId).slice().sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.id.localeCompare(b.id);
  });
  return open[0] ?? null;
}
