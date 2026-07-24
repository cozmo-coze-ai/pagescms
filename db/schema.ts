import {
  pgTable,
  text,
  integer,
  boolean,
  serial,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const userTable = pgTable("user", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  image: text("image"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  // "admin" | "editor" | "viewer". Admins manage collaborators/settings;
  // editors edit content; viewers are read-only. Emails listed in ADMIN_EMAILS
  // are bootstrap admins regardless of this column (so the owners can never be
  // locked out from the UI).
  role: text("role").notNull().default("editor"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  user_role_check: check("user_role_check", sql`${table.role} in ('admin', 'editor', 'viewer')`)
}));

const sessionTable = pgTable("session", {
  id: text("id").notNull().primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" })
}, table => ({
  idx_session_userId: index("idx_session_userId").on(table.userId)
}));

const accountTable = pgTable("account", {
  id: text("id").notNull().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  idx_account_userId: index("idx_account_userId").on(table.userId),
  idx_account_providerId: index("idx_account_providerId").on(table.providerId)
}));

const verificationTable = pgTable("verification", {
  id: text("id").notNull().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, table => ({
  idx_verification_identifier: index("idx_verification_identifier").on(table.identifier)
}));

const cmsItineraryTable = pgTable("cms_itinerary", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  tag: text("tag"),
  tagColor: text("tag_color"),
  coverPath: text("cover_path"),
  published: boolean("published").notNull().default(true),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => userTable.id)
}, table => ({
  uq_cms_itinerary_slug: uniqueIndex("uq_cms_itinerary_slug").on(table.slug)
}));

const cmsHomepageContentTable = pgTable("cms_homepage_content", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => userTable.id)
}, table => ({
  chk_cms_homepage_content_singleton: check("chk_cms_homepage_content_singleton", sql`${table.id} = 1`)
}));

// Singleton row tracking the last coze_client deploy-hook trigger, so the
// debounce guard in content-store.ts survives across separate serverless
// invocations (in-memory state doesn't). Vercel builds cost money — this
// keeps a burst of saves in one editing session from firing one rebuild per save.
// Editor invites for the Supabase-native CMS: a "set your password" link
// with flat permissions — accepting simply creates a normal user (no
// per-repo ACL). Replaces the GitHub-era OTP-based collaborator_invite flow.
// One live invite per email (case-insensitive); re-inviting replaces it.
const cmsEditorInviteTable = pgTable("cms_editor_invite", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  email: text("email").notNull(),
  // Role granted on accept: "admin" | "editor" | "viewer".
  role: text("role").notNull().default("editor"),
  invitedBy: text("invited_by"),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => ({
  uq_cms_editor_invite_token: uniqueIndex("uq_cms_editor_invite_token").on(table.token),
  uq_cms_editor_invite_email_ci: uniqueIndex("uq_cms_editor_invite_email_ci").on(sql`lower(${table.email})`),
  cms_editor_invite_role_check: check("cms_editor_invite_role_check", sql`${table.role} in ('admin', 'editor', 'viewer')`),
}));

const cmsDeployTriggerTable = pgTable("cms_deploy_trigger", {
  id: integer("id").primaryKey().default(1),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  // Durable "content changed" marker: set on every save, compared against
  // triggered_at so a missed/raced build is always detectable later (by the
  // next save, the trailing re-fire, or the cron sweep).
  dirtyAt: timestamp("dirty_at").notNull().defaultNow()
}, table => ({
  chk_cms_deploy_trigger_singleton: check("chk_cms_deploy_trigger_singleton", sql`${table.id} = 1`)
}));

// Languages available for guest-page content. Adding a language to the site
// is: insert a row here + add cms_guest_page rows for it — no code change in
// pagescms or coze_client (both derive their language lists from this table).
const cmsLanguageTable = pgTable("cms_language", {
  // BCP-47-ish short code used in URLs and cms_guest_page.lang ("en", "ko"…).
  code: text("code").notNull().primaryKey(),
  // Native-script label shown in language switchers ("한국어", "中文").
  label: text("label").notNull(),
  // Value for <html lang> and hreflang alternates ("zh-CN" for code "zh").
  htmlLang: text("html_lang").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // Display/order position in switchers; the default language sorts first.
  sortOrder: integer("sort_order").notNull().default(0)
});

// One row = one guest page (gka, gkb, hanbok, celebration…) in one language.
// `fields` is the page's whole structured content (strings, *Html rich text,
// image refs into the pages-media bucket), validated against the per-page
// schema in lib/cms-config.ts. Layout lives in coze_client; only content here.
const cmsGuestPageTable = pgTable("cms_guest_page", {
  id: serial("id").primaryKey(),
  page: text("page").notNull(),
  lang: text("lang").notNull().references(() => cmsLanguageTable.code),
  fields: jsonb("fields").notNull(),
  // True while the row's content came from AI translation and no human has
  // edited it since — drives the "needs review" flag in the editor.
  machineTranslated: boolean("machine_translated").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => userTable.id)
}, table => ({
  uq_cms_guest_page_page_lang: uniqueIndex("uq_cms_guest_page_page_lang").on(table.page, table.lang)
}));

export {
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  cmsItineraryTable,
  cmsHomepageContentTable,
  cmsDeployTriggerTable,
  cmsEditorInviteTable,
  cmsLanguageTable,
  cmsGuestPageTable
};
