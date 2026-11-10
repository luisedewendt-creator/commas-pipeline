/**
 * The ONE settings file. Filled in from the interview with Luis Dewendt.
 * The running app reads everything (name, theme, stages, cadence, profile, voice) from here.
 */
export const crmConfig = {
  appName: "Commas Pipeline",
  tagline: "Deals, follow-ups, and launches in one place.",

  theme: {
    font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    background: "#1c1d21",
    surface: "#27282e",
    text: "#f4f5f7",
    accent: "#2e78ef", // commas.com CSS --brand (confirmed Nov 2026)
    accentText: "#ffffff",
    muted: "#9aa0aa",
    border: "#3a3b43",
    danger: "#ef4444",
    warning: "#f59e0b",
    success: "#22c55e",
    radius: "10px",
  },

  // Order = board column order. Stages with `closed` get no automatic follow-ups
  // except Live, which still gets one check-in after entering the stage.
  stages: [
    { id: "lead", label: "New Lead", color: "#8b919c" },
    { id: "contacted", label: "Contacted", color: "#6ea8f0" },
    { id: "meeting", label: "Meeting Set", color: "#9b8cfc" },
    { id: "qualified", label: "Discovery Completed / Qualified", color: "#5ec2c8" },
    { id: "onboarding", label: "Onboarding / Documents Pending", color: "#e0b15a" },
    { id: "underwriting", label: "Underwriting", color: "#d4923a" },
    { id: "approved", label: "Approved / Ready to Launch", color: "#2e78ef" },
    { id: "live", label: "Live / Transacting", color: "#3db87a", closed: "won" as const },
    { id: "lost", label: "Lost / Disqualified", color: "#e05d5d", closed: "lost" as const },
  ],

  currency: "USD",

  valueField: {
    label: "Projected monthly GMV",
    shortLabel: "GMV/mo",
    empty: "Unset",
  },

  defaultChannel: "whatsapp" as const,

  cadence: {
    defaultDays: 3,
    timezone: "America/New_York",
    weekendToMonday: true,
    // Business-day offsets used after a logged message or call.
    // Meeting, approved (on enter), live, and lost have extra rules in server/cadence.ts.
    byStage: {
      lead: 0,
      contacted: 3,
      meeting: 0,
      qualified: 1,
      onboarding: 2,
      underwriting: 1,
      approved: 2,
      live: 3,
      lost: -1,
    } as Record<string, number>,
    approvedEnterDays: 1,
    liveCheckInOnce: true,
  },

  // Grok and Grok Voice read this before every session.
  profile: {
    yourName: "Luis Dewendt",
    company: "Commas",
    whatYouSell:
      "Payment processing, buyer financing, and payment recovery to coaches, course creators, consultants, agencies, and digital service businesses.",
    idealCustomer:
      "Usually the founder or owner, with operations, finance, or a sales leader involved.",
    dealFlow:
      "New Lead → Contacted → Meeting Set → Discovery Completed / Qualified → Onboarding / Documents Pending → Underwriting → Approved / Ready to Launch → Live / Transacting. Approved and actually processing are separate milestones: watch accounts that are approved but have not started transacting. Lost / Disqualified is the closed-lost stage.",
    valueHook:
      "People say yes because Commas helps them collect more money and make payments easier: more financing options for buyers who cannot pay upfront or were declined elsewhere; proceeds upfront on approved financed purchases instead of chasing installments; an audit of current processing costs plus competitive rates; recovery of failed payments and missed subscription or installment revenue; help with card declines and processing bottlenecks; and hands-on support with migration, integrations, onboarding, and training their sales team.",
    textingStyle:
      "Casual, confident, friendly, and consultative. Usually 2 to 4 short sentences, one specific reason for reaching out, and one easy question. Words like “Brother,” “happy to jam,” and “get your account fired up” fit only when the relationship supports it. Avoid corporate filler such as “synergy,” “leverage,” “touching base,” and “hope this email finds you well.” No em dashes, forced slang, or long feature dumps.",
    // A confirmed example text that received a reply still needs to be added.
    exampleText: "",
  },

  chat: {
    model: "grok-4.7",
  },

  voice: {
    model: "grok-voice-3.0",
    voiceName: "eve",
    speed: 1.0,
    draftsPerDeal: 3,
    autoOfferDrafts: true,
  },

  features: { grokChat: true, grokVoice: true, imessage: true, whatsapp: true },
};

export type CrmConfig = typeof crmConfig;
export default crmConfig;
