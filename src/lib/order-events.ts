import { EventEmitter } from "node:events";
import { Client } from "pg";
import type { MealSlot } from "./meals";

// Order writes call pg_notify on this channel inside their transaction, so
// listeners in any server process hear about a change once it commits.
export const ORDER_CHANNEL = "order_changes";

export type OrderEvent = { siteId: number; date: string; slot: MealSlot };

type Listener = {
  emitter: EventEmitter;
  ready: Promise<void>;
};

const globalForEvents = globalThis as unknown as { orderListener?: Listener };

function startListener(): Listener {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  client.on("notification", (msg) => {
    if (msg.channel === ORDER_CHANNEL && msg.payload) {
      emitter.emit("change", JSON.parse(msg.payload) as OrderEvent);
    }
  });
  // Drop the dead connection; subscribers close their streams and the
  // browsers' EventSource reconnects through a fresh listener.
  let dead = false;
  const fail = (err: unknown) => {
    if (dead) return;
    dead = true;
    console.error("order listener failed", err);
    if (globalForEvents.orderListener?.emitter === emitter) {
      globalForEvents.orderListener = undefined;
    }
    emitter.emit("down");
    client.end().catch(() => {});
  };
  client.on("error", fail);
  client.on("end", () => fail(new Error("connection ended")));

  const ready = client
    .connect()
    .then(() => client.query(`LISTEN ${ORDER_CHANNEL}`))
    .then(() => undefined);
  ready.catch(fail);

  return { emitter, ready };
}

// Returns an unsubscribe function. onDown fires if the listener connection dies.
export async function subscribeOrderEvents(
  onChange: (event: OrderEvent) => void,
  onDown: () => void,
): Promise<() => void> {
  const listener = (globalForEvents.orderListener ??= startListener());
  await listener.ready;
  listener.emitter.on("change", onChange);
  listener.emitter.once("down", onDown);
  return () => {
    listener.emitter.off("change", onChange);
    listener.emitter.off("down", onDown);
  };
}
