import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addBusinessDays,
  bumpWeekend,
  isWeekend,
  planFollowUp,
  settleOnContactInStore,
  replanOnStageChangeInStore,
  nextOpenTask,
} from "../server/cadence.ts";
import { CrmDb } from "../server/db.ts";
import type { Deal, Task } from "../shared/types.ts";

let passed = 0;
let failed = 0;

function assert(name: string, condition: unknown, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertEqual<T>(name: string, actual: T, expected: T) {
  assert(name, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log("Business days and weekends");
assertEqual("Friday + 1 BD = Monday", addBusinessDays("2026-11-06", 1), "2026-11-09");
assertEqual("Wednesday + 3 BD = Monday", addBusinessDays("2026-11-04", 3), "2026-11-09");
assertEqual("Friday + 0 BD = Friday", addBusinessDays("2026-11-06", 0), "2026-11-06");
assertEqual("Saturday + 0 BD = Monday", addBusinessDays("2026-11-07", 0), "2026-11-09");
assertEqual("Sunday + 0 BD = Monday", addBusinessDays("2026-11-08", 0), "2026-11-09");
assertEqual("Thursday + 2 BD = Monday", addBusinessDays("2026-11-05", 2), "2026-11-09");
assert("Saturday is weekend", isWeekend("2026-11-07"));
assert("Monday is not weekend", !isWeekend("2026-11-09"));
assertEqual("bump Saturday to Monday", bumpWeekend("2026-11-07"), "2026-11-09");
assertEqual("bump Sunday to Monday", bumpWeekend("2026-11-08"), "2026-11-09");

console.log("Per-stage planning");
const base = {
  meetingDate: null as string | null,
  reengagementDate: null as string | null,
};
assertEqual("New Lead same business day", planFollowUp({ stage: "lead", ...base }, "contact", "2026-11-09")?.dueDate, "2026-11-09");
assertEqual("New Lead weekend moves to Monday", planFollowUp({ stage: "lead", ...base }, "contact", "2026-11-07")?.dueDate, "2026-11-09");
assertEqual("Contacted + 3 BD", planFollowUp({ stage: "contacted", ...base }, "contact", "2026-11-09")?.dueDate, "2026-11-12");
assertEqual("Qualified + 1 BD", planFollowUp({ stage: "qualified", ...base }, "contact", "2026-11-09")?.dueDate, "2026-11-10");
assertEqual("Onboarding + 2 BD", planFollowUp({ stage: "onboarding", ...base }, "contact", "2026-11-09")?.dueDate, "2026-11-11");
assertEqual("Underwriting title", planFollowUp({ stage: "underwriting", ...base }, "contact", "2026-11-09")?.title, "Internal status check");
assertEqual("Underwriting + 1 BD", planFollowUp({ stage: "underwriting", ...base }, "contact", "2026-11-09")?.dueDate, "2026-11-10");
assertEqual("Approved enter + 1 BD", planFollowUp({ stage: "approved", ...base }, "stage_enter", "2026-11-09")?.dueDate, "2026-11-10");
assertEqual("Approved contact + 2 BD", planFollowUp({ stage: "approved", ...base }, "contact", "2026-11-09")?.dueDate, "2026-11-11");
assertEqual("Live enter + 3 BD", planFollowUp({ stage: "live", ...base }, "stage_enter", "2026-11-09")?.dueDate, "2026-11-12");
assertEqual("Live enter title", planFollowUp({ stage: "live", ...base }, "stage_enter", "2026-11-09")?.title, "Check in");
assertEqual("Live contact creates none", planFollowUp({ stage: "live", ...base }, "contact", "2026-11-09"), null);
assertEqual("Lost contact creates none", planFollowUp({ stage: "lost", ...base }, "contact", "2026-11-09"), null);
assertEqual(
  "Meeting reminder is the day before",
  planFollowUp({ stage: "meeting", meetingDate: "2026-11-13", reengagementDate: null }, "stage_enter", "2026-11-09")?.dueDate,
  "2026-11-12",
);
assertEqual(
  "No-show is same business day",
  planFollowUp({ stage: "meeting", ...base }, "no_show", "2026-11-09")?.dueDate,
  "2026-11-09",
);
assertEqual(
  "Re-engage uses the agreed date",
  planFollowUp({ stage: "lost", meetingDate: null, reengagementDate: "2026-12-01" }, "reengage", "2026-11-09")?.dueDate,
  "2026-12-01",
);
assertEqual("New deal first outreach today", planFollowUp({ stage: "lead", ...base }, "new_deal", "2026-11-09")?.title, "First outreach");

console.log("settleOnContact and pinned dates");

function deal(partial: Partial<Deal> & Pick<Deal, "id" | "stage">): Deal {
  return {
    name: "Test",
    company: "Test Co",
    value: 1000,
    contactName: "Pat",
    phone: "+15555550199",
    email: "pat@example.com",
    channel: "whatsapp",
    notes: "",
    meetingDate: null,
    approvedAt: null,
    reengagementDate: null,
    enteredStageAt: "2026-11-09T15:00:00.000Z",
    createdAt: "2026-11-09T15:00:00.000Z",
    updatedAt: "2026-11-09T15:00:00.000Z",
    ...partial,
  };
}

function task(partial: Partial<Task> & Pick<Task, "id" | "dealId" | "dueDate">): Task {
  return {
    title: "Follow up",
    done: false,
    doneAt: null,
    pinned: false,
    ...partial,
  };
}

{
  const store = {
    tasks: [
      task({ id: "t1", dealId: "d1", dueDate: "2026-11-06", title: "Overdue" }),
      task({ id: "t2", dealId: "d1", dueDate: "2026-11-09", title: "Due today" }),
      task({ id: "t3", dealId: "d1", dueDate: "2026-11-20", title: "Future extra" }),
    ],
  };
  const next = settleOnContactInStore(store, deal({ id: "d1", stage: "contacted" }), "2026-11-09", "2026-11-09T16:00:00.000Z");
  const open = store.tasks.filter((t) => !t.done);
  assertEqual("clears overdue and due-today", store.tasks.filter((t) => t.done).length, 2);
  assertEqual("leaves exactly one open task", open.length, 1);
  assertEqual("moves the future task instead of duplicating", next?.id, "t3");
  assertEqual("contacted next date is +3 BD", next?.dueDate, "2026-11-12");
}

{
  const store = {
    tasks: [task({ id: "pin", dealId: "d2", dueDate: "2026-11-20", title: "Agreed", pinned: true })],
  };
  const next = settleOnContactInStore(store, deal({ id: "d2", stage: "contacted" }), "2026-11-09");
  assertEqual("pinned future date survives contact", next?.dueDate, "2026-11-20");
  assert("pinned flag remains", next?.pinned === true);
  assertEqual("still exactly one open task", store.tasks.filter((t) => !t.done).length, 1);
}

{
  const store = {
    tasks: [task({ id: "pin2", dealId: "d3", dueDate: "2026-11-20", title: "Agreed", pinned: true })],
  };
  const moved = deal({ id: "d3", stage: "onboarding" });
  const next = replanOnStageChangeInStore(store, moved, "2026-11-09");
  assertEqual("pinned future date survives stage change", next?.dueDate, "2026-11-20");
}

{
  const store = {
    tasks: [task({ id: "old", dealId: "d4", dueDate: "2026-11-12", title: "Follow up" })],
  };
  const moved = deal({ id: "d4", stage: "approved" });
  const next = replanOnStageChangeInStore(store, moved, "2026-11-09");
  assertEqual("stage change replans approved enter +1 BD", next?.dueDate, "2026-11-10");
  assertEqual("exactly one open after stage change", store.tasks.filter((t) => !t.done).length, 1);
}

{
  const store = { tasks: [task({ id: "live1", dealId: "d5", dueDate: "2026-11-12", title: "Check in" })] };
  const live = deal({ id: "d5", stage: "live" });
  const next = settleOnContactInStore(store, live, "2026-11-12");
  assertEqual("live contact creates no new follow-up", next, null);
  assertEqual("live check-in is marked done", store.tasks[0].done, true);
}

console.log("Database settleOnContact");
const dir = mkdtempSync(join(tmpdir(), "commas-pipeline-"));
const db = new CrmDb(join(dir, "crm.json"));
const created = db.createDeal({
  name: "Cadence Test Co",
  company: "Cadence Test Co",
  stage: "contacted",
  contactName: "Taylor Demo",
  phone: "+15555550177",
  email: "taylor@example.com",
  value: 12000,
});
assertEqual("new deal starts with exactly one open task", created.tasks.filter((t) => !t.done).length, 1);

// Force an overdue task plus a future extra, then log a message.
db.data.tasks = db.data.tasks.map((t) =>
  t.dealId === created.id && !t.done ? { ...t, dueDate: "2020-01-01", title: "Overdue" } : t,
);
db.data.tasks.push({
  id: "extra-future",
  dealId: created.id,
  title: "Extra future",
  dueDate: "2026-12-01",
  done: false,
  doneAt: null,
  pinned: false,
});
db.save();
const after = db.logActivity(created.id, { type: "message", body: "Sent a note" });
const openAfter = after?.tasks.filter((t) => !t.done) ?? [];
assertEqual("logging a message leaves exactly one open follow-up", openAfter.length, 1);
assert("overdue task is done", after?.tasks.some((t) => t.title === "Overdue" && t.done) === true);
assertEqual("next follow-up uses contacted cadence of 3 BD from today", openAfter[0]?.dueDate, addBusinessDays(db.today(), 3));
assert("next task helper agrees", nextOpenTask(db.data, created.id)?.id === openAfter[0]?.id);

const pinned = db.addTask(created.id, { title: "Call Thursday", dueDate: "2026-12-10", pinned: true });
const openPinned = pinned?.tasks.filter((t) => !t.done) ?? [];
assertEqual("manual agreed date replaces previous open tasks", openPinned.length, 1);
assertEqual("manual date is stored", openPinned[0]?.dueDate, "2026-12-10");
const afterPinnedContact = db.logActivity(created.id, { type: "call", body: "Quick call" });
const still = afterPinnedContact?.tasks.filter((t) => !t.done) ?? [];
assertEqual("contact does not overwrite the agreed date", still[0]?.dueDate, "2026-12-10");

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
