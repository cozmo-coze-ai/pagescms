CREATE TABLE "cms_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target" text,
	"base_updated_at" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"published_by" text,
	CONSTRAINT "cms_proposal_kind_check" CHECK ("cms_proposal"."kind" in ('itinerary', 'homepage_design')),
	CONSTRAINT "cms_proposal_status_check" CHECK ("cms_proposal"."status" in ('draft', 'published', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "cms_proposal_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_proposal" ADD CONSTRAINT "cms_proposal_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_proposal_version" ADD CONSTRAINT "cms_proposal_version_proposal_id_cms_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."cms_proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cms_proposal_version" ON "cms_proposal_version" USING btree ("proposal_id","version");