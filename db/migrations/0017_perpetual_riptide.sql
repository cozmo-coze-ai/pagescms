ALTER TABLE "cms_editor_invite" ADD COLUMN "role" text DEFAULT 'editor' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'editor' NOT NULL;