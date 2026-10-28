// Sample data modelled on the delivery whiteboard (src/pic/01.png) and the
// weekly menu (src/pic/02.png). Names and phone numbers are made up.
// WARNING: empties every table first. Development only: `npm run db:seed`.
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  employees,
  menus,
  priceTiers,
  routes,
  siteDefaultLines,
  siteMealPlans,
  sites,
} from "@/db/schema";
import { addDays, isoWeekday, taipeiDate } from "@/lib/meals";

const DRIVERS = ["阿達", "小晴", "阿玟", "阿燕", "阿勇", "小蔡", "阿新", "阿明"];
const COMPANIES = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const PLANTS = ["一廠", "二廠", "三廠"];
const PRICES = [70, 60, 50];

// Monday to Saturday, from the menu photo.
const WEEK_MENU = [
  {
    main: "香菇甜絲",
    sides: ["北平烤鴨", "三杯米血", "番茄炒蛋", "花生麵筋", "炒高麗", "翠綠蔬菜"],
    soup: "蘿蔔貢丸湯",
    b: ["櫻花蝦炒飯", "烤鴨", "三杯米血", "時鮮蔬菜"],
  },
  {
    main: "福州肉丸",
    sides: ["芝麻炸雞腿", "五香滷蛋", "豆干絲海帶絲", "絲瓜金針菇", "銀芽三絲", "綠色蔬菜"],
    soup: "豆腐味噌湯",
    b: [],
  },
  {
    main: "炒海龍",
    sides: ["橙汁排骨", "碎脯煎蛋", "酥炸鮮魚", "泡菜", "滷蘿蔔", "時鮮蔬菜"],
    soup: "玉米蛋花湯",
    b: ["豐原排骨酥麵", "芝麻包"],
  },
  {
    main: "黃金白蝦",
    sides: ["香酥雞排", "胖胖果", "柴魚蒸蛋", "香菇肉燥", "胡瓜", "田園蔬菜"],
    soup: "四神湯",
    b: [],
  },
  {
    main: "牙籤海帶",
    sides: ["日式里肌", "清蒸南瓜", "毛豆干丁", "丁香花生", "白菜滷", "快炒青菜"],
    soup: "酸辣湯",
    b: ["肉末炒冬粉", "小籠湯包"],
  },
  {
    main: "中式香腸",
    sides: ["雞胸肉", "豆腐鑲肉", "五更腸旺", "冬瓜燴鴿蛋", "白色蔬菜", "當季蔬菜"],
    soup: "豆腐蛋花湯",
    b: [],
  },
];

async function main() {
  await db.execute(sql`
    truncate table order_changes, order_lines, orders, menus, holidays,
      site_default_lines, site_meal_plans, route_driver_overrides, routes,
      sites, companies, price_tiers, employees
    restart identity cascade
  `);

  await db.insert(priceTiers).values([
    { price: 70, sideDishCount: 6 },
    { price: 60, sideDishCount: 5 },
    { price: 50, sideDishCount: 4 },
  ]);

  const staff = await db
    .insert(employees)
    .values([
      { name: "管理員", phone: "0900-000-000", role: "admin" as const },
      ...DRIVERS.map((name, i) => ({
        name,
        phone: `0912-345-${String(601 + i)}`,
      })),
    ])
    .returning();
  const drivers = staff.slice(1);

  const lunchRoutes = await db
    .insert(routes)
    .values(
      drivers.map((d, i) => ({
        slot: "lunch" as const,
        name: `${d.name}線`,
        defaultDriverId: d.id,
        sortOrder: i,
      })),
    )
    .returning();
  const dinnerRoutes = await db
    .insert(routes)
    .values(
      drivers.slice(0, 2).map((d, i) => ({
        slot: "dinner" as const,
        name: `${d.name}晚班線`,
        defaultDriverId: d.id,
        sortOrder: i,
      })),
    )
    .returning();

  const companyRows = await db
    .insert(companies)
    .values(COMPANIES.map((c) => ({ name: `${c}公司` })))
    .returning();

  // Three to four sites per lunch route, spread across companies.
  let n = 0;
  for (const [r, route] of lunchRoutes.entries()) {
    const count = 3 + (r % 2);
    for (let seq = 0; seq < count; seq++, n++) {
      const company = companyRows[n % companyRows.length];
      const [site] = await db
        .insert(sites)
        .values({
          companyId: company.id,
          name: PLANTS[Math.floor(n / companyRows.length) % PLANTS.length],
        })
        .returning();
      const price = PRICES[n % PRICES.length];

      await db.insert(siteMealPlans).values({
        siteId: site.id,
        slot: "lunch",
        routeId: route.id,
        routeSeq: seq,
        unitPrice: price,
      });
      const lines = [
        { kind: "meat_a" as const, quantity: 5 + ((n * 7) % 30) },
        { kind: "veg_a" as const, quantity: n % 3 },
        { kind: "no_pork" as const, quantity: n % 5 === 1 ? 2 : 0 },
        { kind: "b" as const, quantity: n % 4 === 0 ? 2 : 0 },
        {
          kind: "other" as const,
          quantity: n % 7 === 3 ? 1 : 0,
          label: "不吃牛",
        },
      ].filter((l) => l.quantity > 0);
      await db.insert(siteDefaultLines).values(
        lines.map((l) => ({
          ...l,
          siteId: site.id,
          slot: "lunch" as const,
          unitPrice: price,
        })),
      );

      // Every fifth site also takes dinner, Monday to Friday.
      if (n % 5 === 0) {
        const dinnerRoute = dinnerRoutes[(n / 5) % dinnerRoutes.length];
        await db.insert(siteMealPlans).values({
          siteId: site.id,
          slot: "dinner",
          routeId: dinnerRoute.id,
          routeSeq: seq,
          unitPrice: price,
          orderWeekdays: [1, 2, 3, 4, 5],
        });
        await db.insert(siteDefaultLines).values({
          siteId: site.id,
          slot: "dinner",
          kind: "meat_a",
          unitPrice: price,
          quantity: 3 + (n % 8),
        });
      }
    }
  }

  // Menus for this week and next, both slots. Dinner shifts the week by a day
  // so the two menus differ.
  const today = taipeiDate();
  const monday = addDays(today, 1 - isoWeekday(today));
  const menuRows = [];
  for (let d = 0; d < 13; d++) {
    const date = addDays(monday, d);
    const weekday = isoWeekday(date);
    if (weekday === 7) continue;
    for (const [slot, shift] of [
      ["lunch", 0],
      ["dinner", 1],
    ] as const) {
      const m = WEEK_MENU[(weekday - 1 + shift) % WEEK_MENU.length];
      menuRows.push({
        date,
        slot,
        mainDish: m.main,
        sideDishes: m.sides,
        soup: m.soup,
        bMealItems: m.b,
      });
    }
  }
  await db.insert(menus).values(menuRows);

  console.log(
    `Seeded ${drivers.length} drivers, ${companyRows.length} companies, ${n} sites, ${menuRows.length} menus.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
