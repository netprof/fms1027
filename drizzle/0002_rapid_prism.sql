ALTER TYPE "public"."meal_kind" ADD VALUE 'no_pork' BEFORE 'b';--> statement-breakpoint
ALTER TYPE "public"."meal_kind" ADD VALUE 'other';--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_default_lines" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" DROP CONSTRAINT "order_lines_order_id_kind_unit_price_unique";--> statement-breakpoint
ALTER TABLE "site_default_lines" DROP CONSTRAINT "site_default_lines_site_id_slot_kind_unit_price_pk";--> statement-breakpoint
ALTER TABLE "site_default_lines" ADD CONSTRAINT "site_default_lines_site_id_slot_kind_unit_price_label_pk" PRIMARY KEY("site_id","slot","kind","unit_price","label");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_kind_unit_price_label_unique" UNIQUE("order_id","kind","unit_price","label");
