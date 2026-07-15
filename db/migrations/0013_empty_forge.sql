CREATE TABLE "cms_homepage_content" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "chk_cms_homepage_content_singleton" CHECK ("cms_homepage_content"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "cms_itinerary" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"tag" text,
	"tag_color" text,
	"cover_path" text,
	"published" boolean DEFAULT true NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "cms_homepage_content" ADD CONSTRAINT "cms_homepage_content_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_itinerary" ADD CONSTRAINT "cms_itinerary_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cms_itinerary_slug" ON "cms_itinerary" USING btree ("slug");