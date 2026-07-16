DROP TABLE "action_run" CASCADE;--> statement-breakpoint
DROP TABLE "cache_file_meta" CASCADE;--> statement-breakpoint
DROP TABLE "cache_file" CASCADE;--> statement-breakpoint
DROP TABLE "cache_permission" CASCADE;--> statement-breakpoint
DROP TABLE "collaborator_invite" CASCADE;--> statement-breakpoint
DROP TABLE "collaborator" CASCADE;--> statement-breakpoint
DROP TABLE "config" CASCADE;--> statement-breakpoint
DROP TABLE "github_installation_token" CASCADE;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "github_username";