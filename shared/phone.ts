import type { Channel } from "./types.ts";

export interface NormalizedPhone {
  e164: string;
  digits: string;
}

/**
 * Normalize a phone number for sms: and wa.me links.
 * 10 digits are treated as US (+1). Numbers that already include a country
 * code (leading +, leading 00, or more than 10 digits that are not a US 1+10)
 * are left with that country code. Never force +1 onto an international number.
 */
export function normalizePhone(raw: string): NormalizedPhone | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00") && !hasPlus) {
    digits = digits.slice(2);
    if (!digits) return null;
    return { e164: `+${digits}`, digits };
  }

  if (hasPlus) {
    return { e164: `+${digits}`, digits };
  }

  if (digits.length === 10) {
    return { e164: `+1${digits}`, digits: `1${digits}` };
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return { e164: `+${digits}`, digits };
  }

  return { e164: `+${digits}`, digits };
}

export function messageUrl(phone: string, channel: Channel): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (channel === "whatsapp") return `https://wa.me/${normalized.digits}`;
  return `sms:${normalized.e164}`;
}
