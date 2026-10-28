import { getCurrentEmployee } from "@/lib/auth";
import { isMonth, monthlyStatement } from "@/lib/reports";
import { download } from "../download";

// GET /api/reports/monthly?month=YYYY-MM — billing, admins only.
export async function GET(request: Request) {
  const employee = await getCurrentEmployee();
  if (!employee) return Response.json({ error: "請先登入" }, { status: 401 });
  if (employee.role !== "admin") {
    return Response.json({ error: "需要管理者權限" }, { status: 403 });
  }
  const month = new URL(request.url).searchParams.get("month");
  if (!isMonth(month)) return Response.json({ error: "bad month" }, { status: 400 });
  return download(await monthlyStatement(month));
}
