import { crmConfig } from "../config/crm.config.ts";
import type { Activity, Deal, Task } from "../shared/types.ts";
import { addBusinessDays, addCalendarDays, todayYmd } from "./cadence.ts";
import { CrmDb, getDbPath, resetSingleton } from "./db.ts";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function buildDemoData(today = todayYmd()) {
  const overdueDate = addCalendarDays(today, -4);
  const meetingDate = addBusinessDays(today, 5);
  const approvedAt = addCalendarDays(today, -8);

  const deals: Deal[] = [
    {
      id: "deal-willow",
      name: "Willow Coaching Co",
      company: "Willow Coaching Co",
      stage: "lead",
      value: 18000,
      contactName: "Jordan Hale",
      phone: "+15555550101",
      email: "jordan.hale@example.com",
      channel: "whatsapp",
      notes: "FICTIONAL DEMO. Founder of a group coaching program looking at processing and financing.",
      meetingDate: null,
      approvedAt: null,
      reengagementDate: null,
      enteredStageAt: isoDaysAgo(0),
      createdAt: isoDaysAgo(0),
      updatedAt: isoDaysAgo(0),
    },
    {
      id: "deal-northbeam",
      name: "Northbeam Agency",
      company: "Northbeam Agency",
      stage: "contacted",
      value: 42000,
      contactName: "Casey Quinn",
      phone: "+15555550102",
      email: "casey.quinn@example.com",
      channel: "whatsapp",
      notes: "FICTIONAL DEMO. Agency owner. Last spoke about failed payment recovery on client checkouts. Follow-up is overdue on purpose.",
      meetingDate: null,
      approvedAt: null,
      reengagementDate: null,
      enteredStageAt: isoDaysAgo(10),
      createdAt: isoDaysAgo(12),
      updatedAt: isoDaysAgo(7),
    },
    {
      id: "deal-lark",
      name: "Lark & Pine Consulting",
      company: "Lark & Pine Consulting",
      stage: "meeting",
      value: 27000,
      contactName: "Avery Chen",
      phone: "+15555550103",
      email: "avery.chen@example.com",
      channel: "imessage",
      notes: "FICTIONAL DEMO. Consultant. Meeting booked to review current processing costs and financing options.",
      meetingDate,
      approvedAt: null,
      reengagementDate: null,
      enteredStageAt: isoDaysAgo(2),
      createdAt: isoDaysAgo(6),
      updatedAt: isoDaysAgo(2),
    },
    {
      id: "deal-harbor",
      name: "Harbor Digital",
      company: "Harbor Digital",
      stage: "onboarding",
      value: 65000,
      contactName: "Riley Thomas",
      phone: "+15555550104",
      email: "riley.thomas@example.com",
      channel: "whatsapp",
      notes: "FICTIONAL DEMO. Course business. Discovery done. Waiting on bank docs and processing application.",
      meetingDate: null,
      approvedAt: null,
      reengagementDate: null,
      enteredStageAt: isoDaysAgo(1),
      createdAt: isoDaysAgo(20),
      updatedAt: isoDaysAgo(1),
    },
    {
      id: "deal-maple",
      name: "Maple Street Courses",
      company: "Maple Street Courses",
      stage: "approved",
      value: 51000,
      contactName: "Sam Ortiz",
      phone: "+15555550105",
      email: "sam.ortiz@example.com",
      channel: "whatsapp",
      notes: "FICTIONAL DEMO. Approved and ready to launch, but not yet transacting. Sales team still needs checkout training.",
      meetingDate: null,
      approvedAt,
      reengagementDate: null,
      enteredStageAt: isoDaysAgo(8),
      createdAt: isoDaysAgo(30),
      updatedAt: isoDaysAgo(3),
    },
    {
      id: "deal-brightwell",
      name: "Brightwell Studio",
      company: "Brightwell Studio",
      stage: "live",
      value: 33000,
      contactName: "Morgan Ellis",
      phone: "+15555550106",
      email: "morgan.ellis@example.com",
      channel: "whatsapp",
      notes: "FICTIONAL DEMO. Live and transacting. One post-launch check-in is scheduled.",
      meetingDate: null,
      approvedAt: addCalendarDays(today, -20),
      reengagementDate: null,
      enteredStageAt: isoDaysAgo(1),
      createdAt: isoDaysAgo(40),
      updatedAt: isoDaysAgo(1),
    },
  ];

  const tasks: Task[] = [
    {
      id: "task-willow",
      dealId: "deal-willow",
      title: "First outreach",
      dueDate: today,
      done: false,
      doneAt: null,
      pinned: false,
    },
    {
      id: "task-northbeam",
      dealId: "deal-northbeam",
      title: "Follow up",
      dueDate: overdueDate,
      done: false,
      doneAt: null,
      pinned: false,
    },
    {
      id: "task-lark",
      dealId: "deal-lark",
      title: "Meeting reminder",
      dueDate: addCalendarDays(meetingDate, -1),
      done: false,
      doneAt: null,
      pinned: false,
    },
    {
      id: "task-harbor",
      dealId: "deal-harbor",
      title: "Follow up on documents",
      dueDate: addBusinessDays(today, 2),
      done: false,
      doneAt: null,
      pinned: false,
    },
    {
      id: "task-maple",
      dealId: "deal-maple",
      title: "Follow up to launch",
      dueDate: addBusinessDays(today, 1),
      done: false,
      doneAt: null,
      pinned: false,
    },
    {
      id: "task-brightwell",
      dealId: "deal-brightwell",
      title: "Check in",
      dueDate: addBusinessDays(today, 3),
      done: false,
      doneAt: null,
      pinned: false,
    },
  ];

  const activities: Activity[] = [
    {
      id: "act-willow",
      dealId: "deal-willow",
      type: "note",
      channel: null,
      body: "Demo deal created. New inbound from a coaching founder.",
      at: isoDaysAgo(0),
    },
    {
      id: "act-northbeam-1",
      dealId: "deal-northbeam",
      type: "message",
      channel: "whatsapp",
      body: "Sent a note about recovering failed payments on their client checkouts.",
      at: isoDaysAgo(7),
    },
    {
      id: "act-lark",
      dealId: "deal-lark",
      type: "stage",
      channel: null,
      body: "Stage changed from Contacted to Meeting Set",
      at: isoDaysAgo(2),
    },
    {
      id: "act-harbor",
      dealId: "deal-harbor",
      type: "note",
      channel: null,
      body: "Waiting on voided check and owner ID to finish onboarding docs.",
      at: isoDaysAgo(1),
    },
    {
      id: "act-maple",
      dealId: "deal-maple",
      type: "stage",
      channel: null,
      body: "Stage changed from Underwriting to Approved / Ready to Launch",
      at: isoDaysAgo(8),
    },
    {
      id: "act-brightwell",
      dealId: "deal-brightwell",
      type: "stage",
      channel: null,
      body: "Stage changed from Approved / Ready to Launch to Live / Transacting",
      at: isoDaysAgo(1),
    },
  ];

  return { deals, tasks, activities };
}

export function seedDemo(path = getDbPath()) {
  const db = new CrmDb(path);
  db.replace(buildDemoData());
  resetSingleton();
  return db.path;
}

export function seedEmpty(path = getDbPath()) {
  const db = new CrmDb(path);
  db.replace({ deals: [], tasks: [], activities: [] });
  resetSingleton();
  return db.path;
}

const args = process.argv.slice(2);
if (args.includes("--reset")) {
  const path = seedDemo();
  console.log(`Demo data reset for ${crmConfig.appName}: ${path}`);
} else if (args.includes("--empty")) {
  const path = seedEmpty();
  console.log(`Empty pipeline written: ${path}`);
}
