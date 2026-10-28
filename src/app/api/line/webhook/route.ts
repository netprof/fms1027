import { after } from "next/server";
import { verifySignature } from "@/lib/line/api";
import { handleEvent, type LineEvent } from "@/lib/line/bot";

// POST /api/line/webhook — set this URL (HTTPS) as the Messaging API webhook.
// Answers 200 right away and handles the events afterwards, since parsing
// a message with Claude takes a second or two.
export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-line-signature"))) {
    return new Response("bad signature", { status: 401 });
  }
  const { events } = JSON.parse(body) as { events: LineEvent[] };
  after(async () => {
    for (const event of events) {
      try {
        await handleEvent(event);
      } catch (err) {
        console.error("[line] event failed", err);
      }
    }
  });
  return new Response("ok");
}
