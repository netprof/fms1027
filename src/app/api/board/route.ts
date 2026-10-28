import { getBoard } from "@/lib/board";
import { currentSlot, isIsoDate, isMealSlot, taipeiDate } from "@/lib/meals";
import { ensureDailyOrders } from "@/lib/orders";

// GET /api/board?date=YYYY-MM-DD&slot=lunch|dinner (both optional)
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? taipeiDate();
  const slot = params.get("slot") ?? currentSlot();
  if (!isIsoDate(date) || !isMealSlot(slot)) {
    return Response.json({ error: "bad date or slot" }, { status: 400 });
  }

  await ensureDailyOrders(date, slot);
  return Response.json(await getBoard(date, slot));
}
