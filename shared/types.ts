export type Channel = "imessage" | "whatsapp";
export type ActivityType = "message" | "call" | "note" | "stage";
export type FollowUpStatus = "overdue" | "due_today" | "upcoming" | "none";
export type ClosedKind = "won" | "lost";

export interface StageDef {
  id: string;
  label: string;
  color: string;
  closed?: ClosedKind;
}

export interface Deal {
  id: string;
  name: string;
  company: string;
  stage: string;
  value: number | null;
  contactName: string;
  phone: string;
  email: string;
  channel: Channel;
  notes: string;
  meetingDate: string | null;
  approvedAt: string | null;
  reengagementDate: string | null;
  enteredStageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  dealId: string;
  title: string;
  dueDate: string;
  done: boolean;
  doneAt: string | null;
  pinned: boolean;
}

export interface Activity {
  id: string;
  dealId: string;
  type: ActivityType;
  channel: Channel | null;
  body: string;
  at: string;
}

export interface DealSummary extends Deal {
  nextTask: Task | null;
  status: FollowUpStatus;
  daysSinceApproval: number | null;
}

export interface DealDetail extends DealSummary {
  tasks: Task[];
  activities: Activity[];
}

export interface PipelineSnapshot {
  deals: DealSummary[];
  today: string;
  timezone: string;
  openDealCount: number;
  pipelineGmv: number;
  dueNowCount: number;
  approvedNotTransactingCount: number;
}

export type PlanReason =
  | "contact"
  | "stage_enter"
  | "new_deal"
  | "no_show"
  | "reengage";

export interface PlannedFollowUp {
  dueDate: string;
  title: string;
}
