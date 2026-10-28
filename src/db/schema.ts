// Drizzle table definitions. Run `npm run db:generate` after changing this file.
// Domain rules live in docs/spec.md.
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const employeeRole = pgEnum("employee_role", ["admin", "staff"]);
export const mealSlot = pgEnum("meal_slot", ["lunch", "dinner"]);
// meat_a / veg_a follow the daily menu; b is the pre-ordered B meal.
export const mealKind = pgEnum("meal_kind", ["meat_a", "veg_a", "b"]);
export const changeSource = pgEnum("change_source", [
  "system",
  "customer_web",
  "line",
  "staff",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Employees log in to the back office; most of them also drive a route.
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  role: employeeRole("role").notNull().default("staff"),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

// A site (廠區) is the unit that orders, gets delivered to and is priced.
export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  address: text("address"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

// Routes are set per meal slot so dinner can differ from lunch.
export const routes = pgTable("routes", {
  id: serial("id").primaryKey(),
  slot: mealSlot("slot").notNull(),
  name: text("name").notNull(),
  defaultDriverId: integer("default_driver_id").references(() => employees.id),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// Stand-in driver for one route on one day.
export const routeDriverOverrides = pgTable(
  "route_driver_overrides",
  {
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id),
    date: date("date", { mode: "string" }).notNull(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => employees.id),
  },
  (t) => [primaryKey({ columns: [t.routeId, t.date] })],
);

// Price (NT$) → number of side dishes. Standard is one main, six sides, one soup.
export const priceTiers = pgTable("price_tiers", {
  price: integer("price").primaryKey(),
  sideDishCount: smallint("side_dish_count").notNull(),
});

// Which meal slots a site takes, where it sits on the route and its fixed price.
export const siteMealPlans = pgTable(
  "site_meal_plans",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    slot: mealSlot("slot").notNull(),
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id),
    routeSeq: integer("route_seq").notNull().default(0),
    unitPrice: integer("unit_price")
      .notNull()
      .references(() => priceTiers.price),
    // ISO weekdays (1 = Monday) on which the default order is generated.
    orderWeekdays: smallint("order_weekdays")
      .array()
      .notNull()
      .default([1, 2, 3, 4, 5, 6]),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.slot] })],
);

// Standing quantities copied into each day's order.
export const siteDefaultLines = pgTable(
  "site_default_lines",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    slot: mealSlot("slot").notNull(),
    kind: mealKind("kind").notNull(),
    unitPrice: integer("unit_price")
      .notNull()
      .references(() => priceTiers.price),
    quantity: integer("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.slot, t.kind, t.unitPrice] })],
);

export const menus = pgTable(
  "menus",
  {
    date: date("date", { mode: "string" }).notNull(),
    slot: mealSlot("slot").notNull(),
    mainDish: text("main_dish").notNull(),
    sideDishes: text("side_dishes").array().notNull(),
    soup: text("soup").notNull(),
    bMealItems: text("b_meal_items").array().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.date, t.slot] })],
);

// Days with no service on top of Sundays.
export const holidays = pgTable("holidays", {
  date: date("date", { mode: "string" }).primaryKey(),
  note: text("note"),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    date: date("date", { mode: "string" }).notNull(),
    slot: mealSlot("slot").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [unique().on(t.siteId, t.date, t.slot)],
);

// unitPrice is a snapshot taken when the line is written; billing uses it.
export const orderLines = pgTable(
  "order_lines",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: mealKind("kind").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [unique().on(t.orderId, t.kind, t.unitPrice)],
);

// Audit trail of every order change; also drives dashboard highlights.
export const orderChanges = pgTable("order_changes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  source: changeSource("source").notNull(),
  employeeId: integer("employee_id").references(() => employees.id),
  afterCutoff: boolean("after_cutoff").notNull().default(false),
  reason: text("reason"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
