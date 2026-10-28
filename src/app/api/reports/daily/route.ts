import { getCurrentEmployee } from "@/lib/auth";
import { isIsoDate, isMealSlot } from "@/lib/meals";
import { dailySheet } from "@/lib/reports";
import { download } from "../download";

// GET /api/reports/daily?date=YYYY-MM-DD&slot=lunch|dinner — any employee.
export async function GET(request: Request) {
  if (!(await getCurrentEmployee())) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const slot = params.get("slot");
  if (!isIsoDate(date) || !isMealSlot(slot)) {
    return Response.json({ error: "bad date or slot" }, { status: 400 });
  }
  return download(await dailySheet(date, slot));
}
