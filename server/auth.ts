import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE = "cp_session";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function assertProductionAuth() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.APP_PASSWORD) {
    console.error("APP_PASSWORD is required in production.");
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET) {
    console.error("SESSION_SECRET is required in production.");
    process.exit(1);
  }
}

export function passwordsMatch(provided: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length === 0 || a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const sig = createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${sig}`;
}

function unsign(signed: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const index = signed.lastIndexOf(".");
  if (index < 0) return null;
  const value = signed.slice(0, index);
  const sig = signed.slice(index + 1);
  const expected = createHmac("sha256", secret).update(value).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = value;
  }
  return out;
}

export function readSession(cookieHeader?: string): boolean {
  const raw = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!raw) return false;
  const value = unsign(raw);
  if (!value) return false;
  const [version, expRaw] = value.split(":");
  if (version !== "v1") return false;
  const exp = Number(expRaw);
  return Number.isFinite(exp) && exp > Date.now();
}

export function hasValidSession(req: IncomingMessage): boolean {
  if (!authEnabled()) return true;
  return readSession(req.headers.cookie);
}

function wantsSecureCookie(req: IncomingMessage): boolean {
  const forwarded = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  return forwarded === "https" || ("secure" in req && Boolean((req as Request).secure));
}

function cookieHeader(value: string, req: IncomingMessage, maxAgeMs: number): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];
  if (wantsSecureCookie(req)) parts.push("Secure");
  return parts.join("; ");
}

export function setSessionCookie(req: Request, res: Response) {
  const payload = `v1:${Date.now() + MAX_AGE_MS}`;
  res.setHeader("Set-Cookie", cookieHeader(sign(payload), req, MAX_AGE_MS));
}

export function clearSessionCookie(req: Request, res: Response) {
  res.setHeader("Set-Cookie", cookieHeader("", req, 0));
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled()) return next();
  if (req.path === "/login" && req.method === "POST") return next();
  if (req.path === "/logout" && req.method === "POST") return next();
  if (hasValidSession(req)) return next();
  res.status(401).json({ error: "Unauthorized" });
}

export function rejectUnauthorizedUpgrade(req: IncomingMessage, socket: { write: (s: string) => void; destroy: () => void }): boolean {
  if (hasValidSession(req)) return false;
  socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  socket.destroy();
  return true;
}
