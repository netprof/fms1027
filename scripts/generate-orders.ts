// Creates missing standing orders for a date range, e.g. days the server was
// down. Existing orders are left alone. Missing days use today's defaults.
//   npm run orders:generate                         today
//   npm run orders:generate -- 2026-10-01 2026-10-27
import "dotenv/config";
import { generateDailyOrders } from "@/lib/daily-orders";
import { addDays, isIsoDate, taipeiDate } from "@/lib/meals";

const [from = taipeiDate(), to = from] = process.argv.slice(2);
if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
  console.error("usage: npm run orders:generate -- [from YYYY-MM-DD] [to YYYY-MM-DD]");
  process.exit(1);
}

async function main() {
  for (let date = from; date <= to; date = addDays(date, 1)) {
    await generateDailyOrders(date);
    console.log(`ensured ${date}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
