CREATE TABLE "cms_gpt_key" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cms_gpt_key_hash" ON "cms_gpt_key" USING btree ("key_hash");