CREATE TYPE "public"."line_draft_status" AS ENUM('pending', 'confirmed', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TABLE "line_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"name" text NOT NULL,
	"line_user_id" text,
	"display_name" text,
	"bind_code" text,
	"bind_code_expires_at" timestamp with time zone,
	"bound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_contacts_line_user_id_unique" UNIQUE("line_user_id"),
	CONSTRAINT "line_contacts_bind_code_unique" UNIQUE("bind_code")
);
--> statement-breakpoint
CREATE TABLE "line_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"before" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"message" text NOT NULL,
	"status" "line_draft_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_changes" ADD COLUMN "line_contact_id" integer;--> statement-breakpoint
ALTER TABLE "line_contacts" ADD CONSTRAINT "line_contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_drafts" ADD CONSTRAINT "line_drafts_contact_id_line_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."line_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_drafts" ADD CONSTRAINT "line_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_changes" ADD CONSTRAINT "order_changes_line_contact_id_line_contacts_id_fk" FOREIGN KEY ("line_contact_id") REFERENCES "public"."line_contacts"("id") ON DELETE set null ON UPDATE no action;