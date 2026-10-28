// Runs once per server start. Not during `next build`, and not in the edge
// runtime (the scheduler needs pg and timers).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startDailyOrderScheduler } = await import("./lib/daily-orders");
  startDailyOrderScheduler();
}
