import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crmConfig } from "../config/crm.config.ts";
import type {
  Activity,
  ActivityType,
  Channel,
  Deal,
  DealDetail,
  DealSummary,
  PipelineSnapshot,
  Task,
} from "../shared/types.ts";
import {
  daysBetween,
  followUpStatus,
  isClosedLost,
  isClosedWon,
  nextOpenTask,
  planFollowUp,
  replanOnStageChangeInStore,
  settleOnContactInStore,
  todayYmd,
} from "./cadence.ts";

const here = dirname(fileURLToPath(import.meta.url));

export function getDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  return fromEnv ? resolve(fromEnv) : resolve(here, "../data");
}

export function getDbPath(): string {
  return resolve(getDataDir(), "crm.json");
}

export interface DatabaseFile {
  deals: Deal[];
  tasks: Task[];
  activities: Activity[];
}

function emptyDb(): DatabaseFile {
  return { deals: [], tasks: [], activities: [] };
}

export class CrmDb {
  path: string;
  data: DatabaseFile;

  constructor(path = getDbPath()) {
    this.path = path;
    this.data = emptyDb();
  }

  load() {
    if (!existsSync(this.path)) {
      this.data = emptyDb();
      return this;
    }
    const raw = readFileSync(this.path, "utf8");
    const parsed = JSON.parse(raw) as DatabaseFile;
    this.data = {
      deals: parsed.deals ?? [],
      tasks: parsed.tasks ?? [],
      activities: parsed.activities ?? [],
    };
    return this;
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2) + "\n", "utf8");
    return this;
  }

  replace(data: DatabaseFile) {
    this.data = data;
    this.save();
    return this;
  }

  today() {
    return todayYmd();
  }

  summarizeDeal(deal: Deal, today = this.today()): DealSummary {
    const nextTask = nextOpenTask(this.data, deal.id);
    const daysSinceApproval =
      deal.stage === "approved" && deal.approvedAt
        ? daysBetween(deal.approvedAt, today)
        : null;
    return {
      ...deal,
      nextTask,
      status: followUpStatus(nextTask?.dueDate, today),
      daysSinceApproval,
    };
  }

  snapshot(): PipelineSnapshot {
    const today = this.today();
    const deals = this.data.deals
      .map((d) => this.summarizeDeal(d, today))
      .sort(compareDeals);
    const open = deals.filter((d) => !isClosedLost(d.stage) && !isClosedWon(d.stage));
    return {
      deals,
      today,
      timezone: crmConfig.cadence.timezone,
      openDealCount: open.length,
      pipelineGmv: open.reduce((sum, d) => sum + (d.value ?? 0), 0),
      dueNowCount: deals.filter((d) => d.status === "overdue" || d.status === "due_today").length,
      approvedNotTransactingCount: deals.filter((d) => d.stage === "approved").length,
    };
  }

  getDeal(id: string): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === id);
    if (!deal) return null;
    const today = this.today();
    const summary = this.summarizeDeal(deal, today);
    return {
      ...summary,
      tasks: this.data.tasks
        .filter((t) => t.dealId === id)
        .slice()
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          return a.dueDate.localeCompare(b.dueDate);
        }),
      activities: this.data.activities
        .filter((a) => a.dealId === id)
        .slice()
        .sort((a, b) => b.at.localeCompare(a.at)),
    };
  }

  createDeal(input: Partial<Deal>): DealDetail {
    const now = new Date().toISOString();
    const today = this.today();
    const deal: Deal = {
      id: crypto.randomUUID(),
      name: (input.name ?? "").trim() || "Untitled deal",
      company: input.company?.trim() ?? "",
      stage: input.stage && getStageId(input.stage) ? input.stage : crmConfig.stages[0].id,
      value: normalizeValue(input.value),
      contactName: input.contactName?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      email: input.email?.trim() ?? "",
      channel: input.channel === "imessage" ? "imessage" : crmConfig.defaultChannel,
      notes: input.notes ?? "",
      meetingDate: input.meetingDate || null,
      approvedAt: input.stage === "approved" ? input.approvedAt || today : null,
      reengagementDate: input.reengagementDate || null,
      enteredStageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.data.deals.push(deal);
    const planned = planFollowUp(deal, "new_deal", today);
    if (planned) {
      this.data.tasks.push({
        id: crypto.randomUUID(),
        dealId: deal.id,
        title: planned.title,
        dueDate: planned.dueDate,
        done: false,
        doneAt: null,
        pinned: false,
      });
    }
    this.data.activities.push({
      id: crypto.randomUUID(),
      dealId: deal.id,
      type: "note",
      channel: null,
      body: "Deal created",
      at: now,
    });
    this.save();
    return this.getDeal(deal.id)!;
  }

  updateDeal(id: string, patch: Partial<Deal>): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === id);
    if (!deal) return null;
    const now = new Date().toISOString();
    const today = this.today();
    const prevStage = deal.stage;
    const nextStage = patch.stage && getStageId(patch.stage) ? patch.stage : deal.stage;

    if (patch.name !== undefined) deal.name = patch.name.trim() || deal.name;
    if (patch.company !== undefined) deal.company = patch.company.trim();
    if (patch.value !== undefined) deal.value = normalizeValue(patch.value);
    if (patch.contactName !== undefined) deal.contactName = patch.contactName.trim();
    if (patch.phone !== undefined) deal.phone = patch.phone.trim();
    if (patch.email !== undefined) deal.email = patch.email.trim();
    if (patch.channel !== undefined) {
      deal.channel = patch.channel === "imessage" ? "imessage" : "whatsapp";
    }
    if (patch.notes !== undefined) deal.notes = patch.notes;
    if (patch.meetingDate !== undefined) deal.meetingDate = patch.meetingDate || null;
    if (patch.reengagementDate !== undefined) {
      deal.reengagementDate = patch.reengagementDate || null;
    }

    const stageChanged = nextStage !== prevStage;
    if (stageChanged) {
      const fromLabel = stageLabel(prevStage);
      const toLabel = stageLabel(nextStage);
      deal.stage = nextStage;
      deal.enteredStageAt = now;
      if (nextStage === "approved") deal.approvedAt = today;
      if (nextStage !== "approved" && nextStage !== "live") {
        // keep approvedAt history only while approved or after launch? show badge only on approved.
      }
      this.data.activities.push({
        id: crypto.randomUUID(),
        dealId: deal.id,
        type: "stage",
        channel: null,
        body: `Stage changed from ${fromLabel} to ${toLabel}`,
        at: now,
      });
      replanOnStageChangeInStore(this.data, deal, today, now);
    } else if (
      patch.meetingDate !== undefined &&
      deal.stage === "meeting" &&
      !hasPinnedOpen(this.data.tasks, deal.id)
    ) {
      replanOnStageChangeInStore(this.data, deal, today, now);
    }

    if (patch.reengagementDate !== undefined && deal.stage === "lost" && deal.reengagementDate) {
      const planned = planFollowUp(deal, "reengage", today);
      if (planned) {
        const existing = this.data.tasks.find(
          (t) => t.dealId === deal.id && !t.done && t.pinned && t.title === "Re-engage",
        );
        if (existing) {
          existing.dueDate = planned.dueDate;
        } else {
          this.data.tasks.push({
            id: crypto.randomUUID(),
            dealId: deal.id,
            title: planned.title,
            dueDate: planned.dueDate,
            done: false,
            doneAt: null,
            pinned: true,
          });
        }
      }
    }

    deal.updatedAt = now;
    this.save();
    return this.getDeal(deal.id);
  }

  deleteDeal(id: string): boolean {
    const before = this.data.deals.length;
    this.data.deals = this.data.deals.filter((d) => d.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.dealId !== id);
    this.data.activities = this.data.activities.filter((a) => a.dealId !== id);
    if (this.data.deals.length === before) return false;
    this.save();
    return true;
  }

  logActivity(
    dealId: string,
    input: { type: ActivityType; body?: string; channel?: Channel | null },
  ): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === dealId);
    if (!deal) return null;
    const now = new Date().toISOString();
    const today = this.today();
    const type = input.type;
    const body =
      input.body?.trim() ||
      (type === "message" ? "Message sent" : type === "call" ? "Call logged" : "Note");
    this.data.activities.push({
      id: crypto.randomUUID(),
      dealId,
      type,
      channel: input.channel ?? (type === "message" ? deal.channel : null),
      body,
      at: now,
    });
    if (type === "message" || type === "call") {
      settleOnContactInStore(this.data, deal, today, now);
    }
    deal.updatedAt = now;
    this.save();
    return this.getDeal(dealId);
  }

  settleOnContact(dealId: string, date = this.today()): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === dealId);
    if (!deal) return null;
    settleOnContactInStore(this.data, deal, date, new Date().toISOString());
    deal.updatedAt = new Date().toISOString();
    this.save();
    return this.getDeal(dealId);
  }

  addTask(
    dealId: string,
    input: { title?: string; dueDate: string; pinned?: boolean },
  ): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === dealId);
    if (!deal) return null;
    const now = new Date().toISOString();
    const pinned = Boolean(input.pinned);
    if (pinned) {
      for (const task of this.data.tasks.filter((t) => t.dealId === dealId && !t.done)) {
        task.done = true;
        task.doneAt = now;
      }
    }
    this.data.tasks.push({
      id: crypto.randomUUID(),
      dealId,
      title: input.title?.trim() || "Follow up",
      dueDate: input.dueDate,
      done: false,
      doneAt: null,
      pinned,
    });
    deal.updatedAt = now;
    this.save();
    return this.getDeal(dealId);
  }

  updateTask(
    dealId: string,
    taskId: string,
    patch: Partial<Pick<Task, "title" | "dueDate" | "done" | "pinned">>,
  ): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === dealId);
    const task = this.data.tasks.find((t) => t.id === taskId && t.dealId === dealId);
    if (!deal || !task) return null;
    const now = new Date().toISOString();
    if (patch.title !== undefined) task.title = patch.title;
    if (patch.dueDate !== undefined) {
      task.dueDate = patch.dueDate;
      if (patch.pinned !== false) task.pinned = true;
    }
    if (patch.pinned !== undefined) task.pinned = patch.pinned;
    if (patch.done !== undefined) {
      task.done = patch.done;
      task.doneAt = patch.done ? now : null;
    }
    deal.updatedAt = now;
    this.save();
    return this.getDeal(dealId);
  }

  markNoShow(dealId: string): DealDetail | null {
    const deal = this.data.deals.find((d) => d.id === dealId);
    if (!deal) return null;
    const now = new Date().toISOString();
    const today = this.today();
    const planned = planFollowUp(deal, "no_show", today);
    if (planned) {
      for (const task of this.data.tasks.filter((t) => t.dealId === dealId && !t.done && !t.pinned)) {
        task.done = true;
        task.doneAt = now;
      }
      if (!hasPinnedOpen(this.data.tasks, dealId)) {
        this.data.tasks.push({
          id: crypto.randomUUID(),
          dealId,
          title: planned.title,
          dueDate: planned.dueDate,
          done: false,
          doneAt: null,
          pinned: false,
        });
      }
    }
    this.data.activities.push({
      id: crypto.randomUUID(),
      dealId,
      type: "note",
      channel: null,
      body: "Marked as no-show. Same-day outreach tasked.",
      at: now,
    });
    deal.updatedAt = now;
    this.save();
    return this.getDeal(dealId);
  }
}

function getStageId(id: string) {
  return crmConfig.stages.find((s) => s.id === id);
}

function stageLabel(id: string) {
  return getStageId(id)?.label ?? id;
}

function normalizeValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function hasPinnedOpen(tasks: Task[], dealId: string) {
  return tasks.some((t) => t.dealId === dealId && !t.done && t.pinned);
}

function compareDeals(a: DealSummary, b: DealSummary) {
  const rank = { overdue: 0, due_today: 1, upcoming: 2, none: 3 };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  const ad = a.nextTask?.dueDate ?? "9999-99-99";
  const bd = b.nextTask?.dueDate ?? "9999-99-99";
  if (ad !== bd) return ad.localeCompare(bd);
  return a.name.localeCompare(b.name);
}

let singleton: CrmDb | null = null;

export function getDb(): CrmDb {
  if (!singleton) {
    singleton = new CrmDb(getDbPath());
    if (existsSync(singleton.path)) {
      singleton.load();
    }
  }
  return singleton;
}

export function resetSingleton() {
  singleton = null;
}
