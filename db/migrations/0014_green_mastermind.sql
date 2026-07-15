CREATE TABLE "cms_deploy_trigger" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cms_deploy_trigger_singleton" CHECK ("cms_deploy_trigger"."id" = 1)
);
