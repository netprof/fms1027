import { connection } from "next/server";
import { subscribeOrderEvents } from "@/lib/order-events";

// Server-Sent Events: one `change` event per committed order change.
export async function GET(request: Request) {
  await connection(); // never prerender: the stream needs a live listener
  const encoder = new TextEncoder();
  const { signal } = request;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      const unsubscribe = await subscribeOrderEvents(
        (event) => send(`event: change\ndata: ${JSON.stringify(event)}\n\n`),
        close,
      );
      // Keeps proxies from dropping an idle connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      signal.addEventListener("abort", close);
      if (signal.aborted) close();
      send("retry: 3000\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
