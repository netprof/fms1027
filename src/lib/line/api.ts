// LINE Messaging API: webhook signature check, reply and push.
// LINE_DRY_RUN=1 logs outgoing messages instead of sending them (local tests).
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.line.me/v2/bot";

// A message object as the Messaging API accepts it (text, flex, ...).
export type LineMessage = Record<string, unknown> & { type: string };

export function verifySignature(body: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function call(path: string, payload: unknown) {
  if (process.env.LINE_DRY_RUN === "1") {
    console.log(`[line:dry-run] ${path} ${JSON.stringify(payload)}`);
    return;
  }
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`LINE ${path} ${res.status}: ${await res.text()}`);
  }
}

export function reply(replyToken: string, messages: LineMessage[]) {
  return call("/message/reply", { replyToken, messages });
}

export function push(to: string, messages: LineMessage[]) {
  return call("/message/push", { to, messages });
}

export async function getDisplayName(userId: string): Promise<string | null> {
  if (process.env.LINE_DRY_RUN === "1") return null;
  const res = await fetch(`${API}/profile/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!res.ok) return null;
  const { displayName } = (await res.json()) as { displayName?: string };
  return displayName ?? null;
}

export const text = (body: string): LineMessage => ({ type: "text", text: body });
