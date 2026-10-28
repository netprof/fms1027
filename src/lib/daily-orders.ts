// Creates each day's standing orders on a timer, so billing never depends on
// someone opening the board that day. ensureDailyOrders is idempotent, so the
// timer, page visits and the backfill script can all run it safely.
import { MEAL_SLOTS, taipeiDate } from "./meals";
import { ensureDailyOrders } from "./orders";

const CHECK_EVERY_MS = 5 * 60_000;

export async function generateDailyOrders(date: string) {
  for (const slot of MEAL_SLOTS) await ensureDailyOrders(date, slot);
}

const globalForScheduler = globalThis as unknown as { dailyOrderTimer?: NodeJS.Timeout };

// Runs right away, then re-checks every few minutes; the first check after
// midnight (Asia/Taipei) creates the new day's orders. Only today: a later
// date would freeze defaults that staff may still edit.
export function startDailyOrderScheduler() {
  if (globalForScheduler.dailyOrderTimer) return;

  let doneFor = "";
  const tick = async () => {
    const today = taipeiDate();
    if (today === doneFor) return;
    try {
      await generateDailyOrders(today);
      doneFor = today;
      console.log(`[daily-orders] ensured orders for ${today}`);
    } catch (err) {
      console.error("[daily-orders] failed, will retry", err);
    }
  };

  globalForScheduler.dailyOrderTimer = setInterval(tick, CHECK_EVERY_MS);
  globalForScheduler.dailyOrderTimer.unref();
  void tick();
}
