CREATE TABLE "login_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"ip" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_failures_username_at_index" ON "login_failures" USING btree ("username","at");--> statement-breakpoint
CREATE INDEX "login_failures_ip_at_index" ON "login_failures" USING btree ("ip","at");