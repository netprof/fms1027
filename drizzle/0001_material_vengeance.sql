CREATE TYPE "public"."change_source" AS ENUM('system', 'customer_web', 'line', 'staff');--> statement-breakpoint
CREATE TYPE "public"."employee_role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."meal_kind" AS ENUM('meat_a', 'veg_a', 'b');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"role" "employee_role" DEFAULT 'staff' NOT NULL,
	"username" text,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"main_dish" text NOT NULL,
	"side_dishes" text[] NOT NULL,
	"soup" text NOT NULL,
	"b_meal_items" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "menus_date_slot_pk" PRIMARY KEY("date","slot")
);
--> statement-breakpoint
CREATE TABLE "order_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"source" "change_source" NOT NULL,
	"employee_id" integer,
	"after_cutoff" boolean DEFAULT false NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"kind" "meal_kind" NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_kind_unit_price_unique" UNIQUE("order_id","kind","unit_price")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_site_id_date_slot_unique" UNIQUE("site_id","date","slot")
);
--> statement-breakpoint
CREATE TABLE "price_tiers" (
	"price" integer PRIMARY KEY NOT NULL,
	"side_dish_count" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_driver_overrides" (
	"route_id" integer NOT NULL,
	"date" date NOT NULL,
	"driver_id" integer NOT NULL,
	CONSTRAINT "route_driver_overrides_route_id_date_pk" PRIMARY KEY("route_id","date")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"name" text NOT NULL,
	"default_driver_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_default_lines" (
	"site_id" integer NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"kind" "meal_kind" NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "site_default_lines_site_id_slot_kind_unit_price_pk" PRIMARY KEY("site_id","slot","kind","unit_price")
);
--> statement-breakpoint
CREATE TABLE "site_meal_plans" (
	"site_id" integer NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"route_id" integer NOT NULL,
	"route_seq" integer DEFAULT 0 NOT NULL,
	"unit_price" integer NOT NULL,
	"order_weekdays" smallint[] DEFAULT '{1,2,3,4,5,6}' NOT NULL,
	CONSTRAINT "site_meal_plans_site_id_slot_pk" PRIMARY KEY("site_id","slot")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"contact_name" text,
	"contact_phone" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_changes" ADD CONSTRAINT "order_changes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_changes" ADD CONSTRAINT "order_changes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_driver_overrides" ADD CONSTRAINT "route_driver_overrides_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_driver_overrides" ADD CONSTRAINT "route_driver_overrides_driver_id_employees_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_default_driver_id_employees_id_fk" FOREIGN KEY ("default_driver_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_default_lines" ADD CONSTRAINT "site_default_lines_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_default_lines" ADD CONSTRAINT "site_default_lines_unit_price_price_tiers_price_fk" FOREIGN KEY ("unit_price") REFERENCES "public"."price_tiers"("price") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_meal_plans" ADD CONSTRAINT "site_meal_plans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_meal_plans" ADD CONSTRAINT "site_meal_plans_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_meal_plans" ADD CONSTRAINT "site_meal_plans_unit_price_price_tiers_price_fk" FOREIGN KEY ("unit_price") REFERENCES "public"."price_tiers"("price") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;