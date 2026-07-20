CREATE TABLE "cms_guest_page" (
	"id" serial PRIMARY KEY NOT NULL,
	"page" text NOT NULL,
	"lang" text NOT NULL,
	"fields" jsonb NOT NULL,
	"machine_translated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "cms_language" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"html_lang" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_guest_page" ADD CONSTRAINT "cms_guest_page_lang_cms_language_code_fk" FOREIGN KEY ("lang") REFERENCES "public"."cms_language"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_guest_page" ADD CONSTRAINT "cms_guest_page_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cms_guest_page_page_lang" ON "cms_guest_page" USING btree ("page","lang");--> statement-breakpoint
INSERT INTO "cms_language" ("code", "label", "html_lang", "enabled", "sort_order") VALUES
	('en', 'English', 'en', true, 0),
	('ko', '한국어', 'ko', true, 1),
	('zh', '中文', 'zh-CN', true, 2),
	('ja', '日本語', 'ja', true, 3)
ON CONFLICT ("code") DO NOTHING;
