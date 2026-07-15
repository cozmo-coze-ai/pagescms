-- pagescms schema for Supabase (Postgres)
-- Generated from db/schema.ts, current state as of migration 0012.
-- Run this once, in full, against the empty Supabase database.

CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"github_username" text,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL DEFAULT false,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
CREATE INDEX "idx_session_userId" ON "session" USING btree ("user_id");

CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "idx_account_userId" ON "account" USING btree ("user_id");
CREATE INDEX "idx_account_providerId" ON "account" USING btree ("provider_id");

CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");

CREATE TABLE "github_installation_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"installation_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL
);
CREATE UNIQUE INDEX "uq_github_installation_token_installationId" ON "github_installation_token" USING btree ("installation_id");

CREATE TABLE "collaborator" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"installation_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"repo_id" integer,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text,
	"email" text NOT NULL,
	"user_id" text REFERENCES "user"("id"),
	"invited_by" text REFERENCES "user"("id")
);
CREATE INDEX "idx_collaborator_owner_repo_email" ON "collaborator" USING btree ("owner","repo","email");
CREATE INDEX "idx_collaborator_userId" ON "collaborator" USING btree ("user_id");
CREATE UNIQUE INDEX "uq_collaborator_owner_repo_email_ci" ON "collaborator" USING btree (lower("owner"),lower("repo"),lower("email"));

CREATE TABLE "collaborator_invite" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "uq_collaborator_invite_token" ON "collaborator_invite" USING btree ("token");
CREATE INDEX "idx_collaborator_invite_owner_repo_email" ON "collaborator_invite" USING btree ("owner","repo","email");
CREATE UNIQUE INDEX "uq_collaborator_invite_owner_repo_email_ci" ON "collaborator_invite" USING btree (lower("owner"),lower("repo"),lower("email"));

CREATE TABLE "config" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"sha" text NOT NULL,
	"version" text NOT NULL,
	"object" text NOT NULL,
	"last_checked_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "idx_config_owner_repo_branch" ON "config" USING btree ("owner","repo","branch");

CREATE TABLE "cache_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"context" text NOT NULL DEFAULT 'collection',
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"parent_path" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"sha" text,
	"size" integer,
	"download_url" text,
	"commit_sha" text,
	"commit_timestamp" timestamp,
	"updated_at" timestamp NOT NULL
);
CREATE INDEX "idx_cache_file_owner_repo_branch_parentPath" ON "cache_file" USING btree ("owner","repo","branch","parent_path");
CREATE UNIQUE INDEX "idx_cache_file_owner_repo_branch_path" ON "cache_file" USING btree ("owner","repo","branch","path");

CREATE TABLE "cache_file_meta" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL DEFAULT '',
	"context" text NOT NULL DEFAULT 'branch',
	"commit_sha" text,
	"commit_timestamp" timestamp,
	"status" text NOT NULL DEFAULT 'ok',
	"error" text,
	"updated_at" timestamp NOT NULL DEFAULT now(),
	"last_checked_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "idx_cache_file_meta_owner_repo_branch_path_context" ON "cache_file_meta" USING btree ("owner","repo","branch","path","context");

CREATE TABLE "cache_permission" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_id" integer NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"last_updated" timestamp NOT NULL
);
CREATE UNIQUE INDEX "idx_cache_permission_githubId_owner_repo" ON "cache_permission" USING btree ("github_id","owner","repo");

CREATE TABLE "action_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"ref" text NOT NULL,
	"workflow_ref" text NOT NULL,
	"sha" text NOT NULL,
	"action_name" text NOT NULL,
	"context_type" text NOT NULL,
	"context_name" text,
	"context_path" text,
	"workflow" text NOT NULL,
	"workflow_run_id" bigint,
	"status" text NOT NULL,
	"conclusion" text,
	"html_url" text,
	"triggered_by" jsonb NOT NULL,
	"failure" jsonb,
	"payload" jsonb NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	"completed_at" timestamp
);
CREATE INDEX "idx_action_run_owner_repo_createdAt" ON "action_run" USING btree ("owner","repo","created_at");
CREATE INDEX "idx_action_run_owner_repo_actionName" ON "action_run" USING btree ("owner","repo","action_name");
CREATE INDEX "idx_action_run_owner_repo_status" ON "action_run" USING btree ("owner","repo","status");
CREATE INDEX "idx_action_run_context" ON "action_run" USING btree ("owner","repo","context_type","context_name","context_path");
CREATE UNIQUE INDEX "idx_action_run_workflowRunId" ON "action_run" USING btree ("workflow_run_id");
