CREATE TABLE "cms_editor_invite" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cms_editor_invite_token" ON "cms_editor_invite" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cms_editor_invite_email_ci" ON "cms_editor_invite" USING btree (lower("email"));