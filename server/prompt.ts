import { crmConfig } from "../config/crm.config.ts";
import type { DealSummary, PipelineSnapshot } from "../shared/types.ts";

export function stripDashes(text: string): string {
  return text.replace(/[\u2014\u2013]/g, ", ");
}

function formatDealLine(deal: DealSummary): string {
  const value =
    deal.value == null ? crmConfig.valueField.empty : `$${deal.value.toLocaleString("en-US")}/mo`;
  const next = deal.nextTask
    ? `${deal.nextTask.title} on ${deal.nextTask.dueDate}${deal.nextTask.pinned ? " (agreed date)" : ""}`
    : "no open follow-up";
  const notes = (deal.notes || "").replace(/\s+/g, " ").trim().slice(0, 220);
  const approved =
    deal.stage === "approved" && deal.daysSinceApproval != null
      ? `; approved but not yet transacting (${deal.daysSinceApproval} days since approval)`
      : "";
  return `- ${deal.id} | ${deal.name} | ${deal.contactName} | stage=${deal.stage} | ${crmConfig.valueField.shortLabel}=${value} | next=${next} | status=${deal.status} | channel=${deal.channel}${approved}${notes ? ` | notes=${notes}` : ""}`;
}

function profileBlock(): string {
  const p = crmConfig.profile;
  const example = p.exampleText.trim()
    ? `Example text that worked:\n${p.exampleText}`
    : "Example text: none yet. A confirmed example still needs to be added, so do not invent a signature phrase from an example.";
  return [
    `You are helping ${p.yourName} at ${p.company}, using the ${crmConfig.appName} CRM.`,
    `What they sell: ${p.whatYouSell}`,
    `Who buys: ${p.idealCustomer}`,
    `How deals move: ${p.dealFlow}`,
    `Why people say yes: ${p.valueHook}`,
    `Texting style: ${p.textingStyle}`,
    example,
    `Deal value is always ${crmConfig.valueField.label}. Never treat it as a one-time contract value.`,
  ].join("\n");
}

function draftRules(): string {
  return [
    "Draft rules:",
    "- Write in Luis's voice, matching the texting style above.",
    "- Keep drafts to 2 to 4 short sentences, with one specific reason for reaching out and one easy question.",
    "- Lead with value or a genuine compliment when you have a real fact to stand on.",
    "- Use only facts from the deal notes and pipeline snapshot. Never invent numbers, meetings, or shared history.",
    "- No em dashes or en dashes. Use commas or periods instead.",
    "- No filler like \"just circling back\", \"touching base\", \"bumping this\", \"synergy\", \"leverage\", or \"hope this email finds you well\".",
    "- No made-up catchphrases and no forced slang.",
    "- Words like \"Brother\", \"happy to jam\", and \"get your account fired up\" only when the notes show a relationship that supports it.",
    "- No links unless asked.",
    "- Nothing is ever sent automatically. Drafts are for Luis to paste and send himself.",
  ].join("\n");
}

export function buildChatSystemPrompt(snapshot: PipelineSnapshot): string {
  const lines = snapshot.deals.map(formatDealLine).join("\n") || "(no deals yet)";
  return [
    profileBlock(),
    "",
    draftRules(),
    "",
    `Today is ${snapshot.today} in ${snapshot.timezone}.`,
    `Open deals: ${snapshot.openDealCount}. Pipeline ${crmConfig.valueField.shortLabel}: $${snapshot.pipelineGmv.toLocaleString("en-US")}. Due now: ${snapshot.dueNowCount}. Approved but not yet transacting: ${snapshot.approvedNotTransactingCount}.`,
    "Open pipeline snapshot:",
    lines,
    "",
    "When asked to draft a text, return only the message text unless Luis asks for options. Offer a few options when useful.",
    "Prefer starting with deals that are overdue, then due today, then approved but not yet transacting.",
  ].join("\n");
}

export function buildVoiceSystemPrompt(snapshot: PipelineSnapshot): string {
  const lines = snapshot.deals.map(formatDealLine).join("\n") || "(no deals yet)";
  return [
    profileBlock(),
    "",
    draftRules(),
    "",
    "Voice behavior:",
    "- Go through deals in this order: most overdue, then due today, then upcoming. Give a one-sentence recap of each deal.",
    `- If auto-offering drafts is on (it is ${crmConfig.voice.autoOfferDrafts ? "on" : "off"}), immediately call propose_drafts with ${crmConfig.voice.draftsPerDeal} options. Do not wait to be asked.`,
    "- Read options briefly: \"Option 1 ..., Option 2 ...\".",
    "- After the user picks one, do NOT read the message again. Confirm in a few words (for example \"Got it, option 2 to Casey. Opening the chat.\"), then call open_chat.",
    "- When the user says it is sent, call log_message, say the next follow-up date in a few words, and move to the next deal.",
    "- Keep every spoken reply short, like a sharp teammate.",
    "- Reminders only: never claim a message was sent by you.",
    "",
    `Today is ${snapshot.today} in ${snapshot.timezone}.`,
    `Open deals: ${snapshot.openDealCount}. Due now: ${snapshot.dueNowCount}. Approved but not yet transacting: ${snapshot.approvedNotTransactingCount}.`,
    "Pipeline snapshot:",
    lines,
  ].join("\n");
}

export const voiceToolSchemas = [
  {
    type: "function",
    name: "list_deals",
    description: "List deals. Use filter=due for overdue and due today, or filter=all for every deal.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["due", "all"] },
      },
      required: ["filter"],
    },
  },
  {
    type: "function",
    name: "get_deal",
    description: "Get one deal by id, including notes, next follow-up, and recent activity.",
    parameters: {
      type: "object",
      properties: { deal_id: { type: "string" } },
      required: ["deal_id"],
    },
  },
  {
    type: "function",
    name: "propose_drafts",
    description: "Show draft text options on screen as clickable cards for a deal.",
    parameters: {
      type: "object",
      properties: {
        deal_id: { type: "string" },
        drafts: { type: "array", items: { type: "string" } },
      },
      required: ["deal_id", "drafts"],
    },
  },
  {
    type: "function",
    name: "open_chat",
    description: "Copy optional text and open iMessage or WhatsApp for the deal. Does not send.",
    parameters: {
      type: "object",
      properties: {
        deal_id: { type: "string" },
        text: { type: "string" },
      },
      required: ["deal_id"],
    },
  },
  {
    type: "function",
    name: "log_message",
    description: "Log that a message was sent, settle follow-ups, and return the next follow-up date.",
    parameters: {
      type: "object",
      properties: {
        deal_id: { type: "string" },
        summary: { type: "string" },
      },
      required: ["deal_id", "summary"],
    },
  },
  {
    type: "function",
    name: "update_deal",
    description: "Update a deal's stage, projected monthly GMV, or notes.",
    parameters: {
      type: "object",
      properties: {
        deal_id: { type: "string" },
        stage: { type: "string" },
        value: { type: "number" },
        note: { type: "string" },
      },
      required: ["deal_id"],
    },
  },
  {
    type: "function",
    name: "next_deal",
    description: "Focus the next deal by due date (overdue first, then due today, then upcoming).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];
