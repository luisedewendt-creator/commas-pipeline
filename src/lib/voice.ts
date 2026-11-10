import { messageUrl } from "../../shared/phone.ts";
import type { DealDetail, DealSummary, PipelineSnapshot } from "../../shared/types.ts";
import { api } from "./api.ts";
import { stripDashes } from "./dashes.ts";

export type VoiceDrafts = { dealId: string; drafts: string[] };

export type VoiceHandlers = {
  onTranscript: (text: string, role: "assistant" | "user") => void;
  onStatus: (status: string) => void;
  onError: (error: string) => void;
  onDrafts: (drafts: VoiceDrafts) => void;
  onRefresh: () => Promise<void> | void;
  onFocusDeal: (dealId: string) => void;
};

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

class PcmPlayer {
  ctx: AudioContext;
  nextTime = 0;
  sources: AudioBufferSourceNode[] = [];

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  enqueue(base64: string) {
    const int16 = new Int16Array(base64ToArrayBuffer(base64));
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) float[i] = int16[i] / 32768;
    const buffer = this.ctx.createBuffer(1, float.length, 24000);
    buffer.getChannelData(0).set(float);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now;
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
    };
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    this.nextTime = this.ctx.currentTime;
  }

  async waitUntilFinished() {
    const remaining = Math.max(0, this.nextTime - this.ctx.currentTime);
    await new Promise((resolve) => setTimeout(resolve, remaining * 1000 + 40));
  }

  close() {
    this.stop();
    void this.ctx.close();
  }
}

export class VoiceClient {
  private ws: WebSocket | null = null;
  private player: PcmPlayer | null = null;
  private media: { stream: MediaStream; ctx: AudioContext; processor: ScriptProcessorNode } | null = null;
  private assistantText = "";
  private toolCallsThisResponse = 0;
  private handlers: VoiceHandlers;

  constructor(handlers: VoiceHandlers) {
    this.handlers = handlers;
  }

  async connect() {
    this.handlers.onStatus("Connecting…");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/voice/ws`);
    this.ws = ws;
    this.player = new PcmPlayer();
    await this.player.resume();

    ws.onopen = () => {
      this.handlers.onStatus("Connected. Starting mic…");
      void this.startMic();
      this.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Let's run through my deals. Start with what needs attention most." }],
        },
      });
      this.send({ type: "response.create" });
    };

    ws.onmessage = (event) => {
      void this.handleMessage(event.data);
    };
    ws.onerror = () => this.handlers.onError("Voice connection failed.");
    ws.onclose = () => this.handlers.onStatus("Disconnected");
  }

  disconnect() {
    this.stopMic();
    this.player?.close();
    this.player = null;
    this.ws?.close();
    this.ws = null;
  }

  pickDraft(index: number, dealName: string) {
    this.sendText(`I picked option ${index + 1} and opened the chat${dealName ? ` to ${dealName}` : ""}.`);
  }

  sendText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.send({ type: "response.create" });
  }

  private send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private async startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 24000, echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext({ sampleRate: 24000 });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);
    processor.onaudioprocess = (event) => {
      const pcm = floatTo16BitPCM(event.inputBuffer.getChannelData(0));
      this.send({ type: "input_audio_buffer.append", audio: arrayBufferToBase64(pcm) });
    };
    this.media = { stream, ctx, processor };
    this.handlers.onStatus("Listening");
  }

  private stopMic() {
    if (!this.media) return;
    this.media.processor.disconnect();
    void this.media.ctx.close();
    this.media.stream.getTracks().forEach((track) => track.stop());
    this.media = null;
  }

  private async handleMessage(raw: unknown) {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    let event: { type?: string; delta?: string; name?: string; arguments?: string; call_id?: string; error?: string };
    try {
      event = JSON.parse(text) as typeof event;
    } catch {
      return;
    }

    if (event.type === "error" || event.error) {
      this.handlers.onError(event.error || "Voice error");
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      this.player?.stop();
    }

    if (event.type === "response.output_audio.delta" && event.delta) {
      this.player?.enqueue(event.delta);
    }

    if (event.type === "response.output_audio_transcript.delta" && event.delta) {
      this.assistantText += event.delta;
      this.handlers.onTranscript(this.assistantText, "assistant");
    }

    if (event.type === "response.created") {
      this.assistantText = "";
      this.toolCallsThisResponse = 0;
    }

    if (event.type === "response.function_call_arguments.done") {
      this.toolCallsThisResponse += 1;
      const output = await this.runTool(event.name ?? "", event.arguments ?? "{}");
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: event.call_id,
          output,
        },
      });
    }

    if (event.type === "response.done") {
      if (this.toolCallsThisResponse > 0) {
        const count = this.toolCallsThisResponse;
        this.toolCallsThisResponse = 0;
        await this.player?.waitUntilFinished();
        if (count > 0) this.send({ type: "response.create" });
      }
    }
  }

  private async runTool(name: string, rawArgs: string): Promise<string> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }

    try {
      if (name === "list_deals") {
        const snapshot = (await api.snapshot()) as PipelineSnapshot;
        const filter = args.filter === "due" ? "due" : "all";
        const deals =
          filter === "due"
            ? snapshot.deals.filter((d) => d.status === "overdue" || d.status === "due_today")
            : snapshot.deals;
        return JSON.stringify(summarize(deals));
      }

      if (name === "get_deal") {
        const deal = await api.deal(String(args.deal_id ?? ""));
        return JSON.stringify(dealView(deal));
      }

      if (name === "propose_drafts") {
        const dealId = String(args.deal_id ?? "");
        const drafts = Array.isArray(args.drafts)
          ? (args.drafts as unknown[]).map((item) => stripDashes(String(item)))
          : [];
        this.handlers.onDrafts({ dealId, drafts });
        return JSON.stringify({ ok: true, count: drafts.length });
      }

      if (name === "open_chat") {
        const deal = await api.deal(String(args.deal_id ?? ""));
        const text = args.text ? stripDashes(String(args.text)) : "";
        if (text) {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            // clipboard may be blocked
          }
        }
        const url = messageUrl(deal.phone, deal.channel);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        this.handlers.onFocusDeal(deal.id);
        return JSON.stringify({ ok: true, url, copied: Boolean(text) });
      }

      if (name === "log_message") {
        const deal = await api.log(String(args.deal_id ?? ""), {
          type: "message",
          body: String(args.summary ?? "Message sent"),
        });
        await this.handlers.onRefresh();
        this.handlers.onFocusDeal(deal.id);
        return JSON.stringify({
          ok: true,
          nextFollowUp: deal.nextTask?.dueDate ?? null,
          title: deal.nextTask?.title ?? null,
        });
      }

      if (name === "update_deal") {
        const patch: { stage?: string; value?: number | null; notes?: string } = {};
        if (typeof args.stage === "string") patch.stage = args.stage;
        if (typeof args.value === "number") patch.value = args.value;
        if (typeof args.note === "string") patch.notes = args.note;
        const deal = await api.updateDeal(String(args.deal_id ?? ""), patch);
        await this.handlers.onRefresh();
        return JSON.stringify(dealView(deal));
      }

      if (name === "next_deal") {
        const snapshot = (await api.snapshot()) as PipelineSnapshot;
        const ordered = snapshot.deals.filter((d) => d.status !== "none");
        const next = ordered[0];
        if (next) this.handlers.onFocusDeal(next.id);
        return JSON.stringify(next ? summarize([next])[0] : { message: "No deals with follow-ups." });
      }

      return JSON.stringify({ error: `Unknown tool ${name}` });
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" });
    }
  }
}

function summarize(deals: DealSummary[]) {
  return deals.map((deal) => ({
    id: deal.id,
    name: deal.name,
    contact: deal.contactName,
    stage: deal.stage,
    value: deal.value,
    status: deal.status,
    nextTask: deal.nextTask,
    channel: deal.channel,
    daysSinceApproval: deal.daysSinceApproval,
  }));
}

function dealView(deal: DealDetail) {
  return {
    id: deal.id,
    name: deal.name,
    contact: deal.contactName,
    stage: deal.stage,
    value: deal.value,
    notes: deal.notes,
    phone: deal.phone,
    channel: deal.channel,
    nextTask: deal.nextTask,
    status: deal.status,
    daysSinceApproval: deal.daysSinceApproval,
  };
}
