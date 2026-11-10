import "dotenv/config";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { crmConfig } from "../config/crm.config.ts";
import { messageUrl } from "../shared/phone.ts";
import type { ActivityType, Channel } from "../shared/types.ts";
import {
  assertProductionAuth,
  authEnabled,
  clearSessionCookie,
  passwordsMatch,
  rejectUnauthorizedUpgrade,
  requireApiAuth,
  setSessionCookie,
} from "./auth.ts";
import { getDb, getDbPath } from "./db.ts";
import { buildChatSystemPrompt, buildVoiceSystemPrompt, stripDashes, voiceToolSchemas } from "./prompt.ts";
import { seedDemo } from "./seed.ts";

assertProductionAuth();

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || (isProd ? 3000 : 3001));
const HOST = "0.0.0.0";

function ensureSeeded() {
  const path = getDbPath();
  if (!existsSync(path)) {
    seedDemo(path);
    getDb();
    return;
  }
  const db = getDb();
  if (db.data.deals.length === 0 && db.data.tasks.length === 0 && db.data.activities.length === 0) {
    seedDemo(path);
    db.load();
  }
}

ensureSeeded();

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/api", requireApiAuth);

app.post("/api/login", (req, res) => {
  const password = String(req.body?.password ?? "");
  if (!authEnabled()) {
    return res.json({ ok: true, auth: false });
  }
  if (!passwordsMatch(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }
  setSessionCookie(req, res);
  res.json({ ok: true, auth: true });
});

app.post("/api/logout", (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: crmConfig.appName });
});

app.get("/api/config", (_req, res) => {
  res.json({
    ...crmConfig,
    hasApiKey: Boolean(process.env.XAI_API_KEY),
  });
});

app.get("/api/deals", (_req, res) => {
  res.json(getDb().snapshot());
});

app.get("/api/deals/:id", (req, res) => {
  const deal = getDb().getDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  res.json(deal);
});

app.post("/api/deals", (req, res) => {
  const deal = getDb().createDeal(req.body ?? {});
  res.status(201).json(deal);
});

app.patch("/api/deals/:id", (req, res) => {
  const deal = getDb().updateDeal(req.params.id, req.body ?? {});
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  res.json(deal);
});

app.delete("/api/deals/:id", (req, res) => {
  const ok = getDb().deleteDeal(req.params.id);
  if (!ok) return res.status(404).json({ error: "Deal not found" });
  res.json({ ok: true });
});

app.post("/api/deals/:id/log", (req, res) => {
  const type = req.body?.type as ActivityType;
  if (!type || !["message", "call", "note", "stage"].includes(type)) {
    return res.status(400).json({ error: "type must be message, call, note, or stage" });
  }
  const deal = getDb().logActivity(req.params.id, {
    type,
    body: req.body?.body,
    channel: req.body?.channel as Channel | undefined,
  });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  res.json(deal);
});

app.post("/api/deals/:id/tasks", (req, res) => {
  const dueDate = req.body?.dueDate as string | undefined;
  if (!dueDate) return res.status(400).json({ error: "dueDate is required" });
  const deal = getDb().addTask(req.params.id, {
    title: req.body?.title,
    dueDate,
    pinned: Boolean(req.body?.pinned ?? true),
  });
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  res.status(201).json(deal);
});

app.patch("/api/deals/:id/tasks/:taskId", (req, res) => {
  const deal = getDb().updateTask(req.params.id, req.params.taskId, req.body ?? {});
  if (!deal) return res.status(404).json({ error: "Task not found" });
  res.json(deal);
});

app.post("/api/deals/:id/no-show", (req, res) => {
  const deal = getDb().markNoShow(req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  res.json(deal);
});

app.get("/api/deals/:id/message-link", (req, res) => {
  const deal = getDb().getDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  const url = messageUrl(deal.phone, deal.channel);
  if (!url) return res.status(400).json({ error: "Deal has no usable phone number" });
  res.json({ url, channel: deal.channel, phone: deal.phone });
});

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Add your xAI API key to .env as XAI_API_KEY to use Grok chat.",
    });
  }
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const snapshot = getDb().snapshot();
  const system = buildChatSystemPrompt(snapshot);
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: crmConfig.chat.model,
        messages: [{ role: "system", content: system }, ...messages],
        stream: false,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text || "xAI request failed" });
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = stripDashes(data.choices?.[0]?.message?.content ?? "");
    res.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat request failed";
    res.status(500).json({ error: message });
  }
});

if (isProd) {
  const dist = resolve(root, "dist");
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/voice")) return next();
    res.sendFile(resolve(dist, "index.html"));
  });
}

const server = createServer(app);
const voiceWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = request.url || "";
  if (!url.startsWith("/voice/ws")) {
    socket.destroy();
    return;
  }
  if (rejectUnauthorizedUpgrade(request, socket)) return;
  voiceWss.handleUpgrade(request, socket, head, (ws) => {
    voiceWss.emit("connection", ws, request);
  });
});

voiceWss.on("connection", (client: WebSocket) => {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    client.send(
      JSON.stringify({
        type: "error",
        error: "Add your xAI API key to .env as XAI_API_KEY to use Grok Voice.",
      }),
    );
    client.close();
    return;
  }

  const upstreamUrl = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(crmConfig.voice.model)}`;
  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  let opened = false;
  const pending: WebSocket.RawData[] = [];

  upstream.on("open", () => {
    opened = true;
    const snapshot = getDb().snapshot();
    const sessionUpdate = {
      type: "session.update",
      session: {
        voice: crmConfig.voice.voiceName,
        instructions: buildVoiceSystemPrompt(snapshot),
        turn_detection: { type: "server_vad" },
        audio: {
          input: { format: { type: "audio/pcm", rate: 24000 } },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            speed: crmConfig.voice.speed,
          },
        },
        tools: voiceToolSchemas,
      },
    };
    upstream.send(JSON.stringify(sessionUpdate));
    for (const msg of pending) upstream.send(msg);
    pending.length = 0;
  });

  upstream.on("message", (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });

  client.on("message", (data) => {
    if (!opened) {
      pending.push(data);
      return;
    }
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
  });

  const closeBoth = () => {
    if (client.readyState === WebSocket.OPEN) client.close();
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  };
  client.on("close", closeBoth);
  upstream.on("close", closeBoth);
  client.on("error", closeBoth);
  upstream.on("error", (err) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "error", error: err.message }));
    }
    closeBoth();
  });
});

server.listen(PORT, HOST, () => {
  const mode = isProd ? "production" : "dev API";
  console.log(`${crmConfig.appName} ${mode} listening on http://${HOST}:${PORT}`);
});
