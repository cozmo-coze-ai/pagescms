/**
 * Supabase-backed content CRUD, replacing the old Octokit read/write logic
 * in the `[owner]/[repo]/[branch]/entries|files|collections` routes.
 *
 * Field validation/transform reuses the existing `fields/` system
 * (generateZodSchema, deepMap, readFns/writeFns) against the static schema
 * in `lib/cms-config.ts`, so the editor UI's contract (a "contentObject" of
 * field name -> value) doesn't change even though storage moved from git
 * files to Postgres rows.
 */

import { after } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cmsItineraryTable, cmsHomepageContentTable, cmsDeployTriggerTable } from "@/db/schema";
import { cmsConfig } from "@/lib/cms-config";
import { readFns, writeFns } from "@/fields/registry";
import { deepMap, generateZodSchema, getSchemaByName, sanitizeObject } from "@/lib/schema";
import { createHttpError } from "@/lib/api-error";
import { renameMediaFolder } from "@/lib/media-store";

const config = { object: cmsConfig };

// Fire-and-forget: after a successful save, ask Vercel to rebuild
// coze_client so the public site picks up the change without a manual
// restart. Debounced via a DB row (not in-memory — this runs across
// separate serverless invocations that don't share memory) so a burst of
// saves in one editing session collapses into a few rebuilds.
//
// The debounce alone has a race: a save landing while an in-flight build is
// already fetching content gets suppressed and never re-fires, leaving the
// site permanently stale (observed 2026-07-15: a 01:17:37 save lost to the
// build triggered at 01:17:31). So suppressed saves also schedule a
// trailing re-fire via `after()` — once the window expires, the first
// waiter to win the atomic row update fires one catch-up build that fetches
// current content; the rest lose the update and do nothing.
const DEPLOY_TRIGGER_DEBOUNCE_SECONDS = 60;

// Durably record "content changed". Runs on every mutation before any
// trigger attempt, so no save can be forgotten: whether a build fires now
// or not, dirty_at > triggered_at keeps saying "a deploy is owed" until one
// actually fires after the change.
const markContentDirty = async () => {
  await db.execute(sql`
    insert into ${cmsDeployTriggerTable} (id, triggered_at, dirty_at)
    values (1, to_timestamp(0), now())
    on conflict (id) do update set dirty_at = now()
  `);
};

// Fire iff a deploy is owed (content dirtier than the last trigger) and the
// debounce window has passed. Atomic single statement, so concurrent
// attempts (saves, trailing re-fires, the cron sweep) elect one winner and
// the rest do nothing. After a successful fire, triggered_at > dirty_at
// makes further attempts no-ops until the next save — no redundant builds.
const attemptDeployTrigger = async (hookUrl: string): Promise<boolean> => {
  const won = await db.execute(sql`
    update ${cmsDeployTriggerTable}
    set triggered_at = now()
    where ${cmsDeployTriggerTable.id} = 1
      and ${cmsDeployTriggerTable.dirtyAt} > ${cmsDeployTriggerTable.triggeredAt}
      and ${cmsDeployTriggerTable.triggeredAt} < now() - interval '${sql.raw(`${DEPLOY_TRIGGER_DEBOUNCE_SECONDS} seconds`)}'
    returning id
  `);
  if (won.length === 0) return false;

  const response = await fetch(hookUrl, { method: "POST" });
  if (!response.ok) {
    // Surface dead/revoked hook URLs in the logs instead of failing silently.
    console.warn("[content-store] coze_client deploy hook returned an error", {
      status: response.status,
      statusText: response.statusText,
    });
  }
  return true;
};

// Used by /api/cron/deploy-sweep — the durable backstop that guarantees a
// dirty save eventually deploys even if every in-process attempt died.
const sweepDeployTrigger = async (): Promise<"fired" | "clean" | "unconfigured"> => {
  const hookUrl = process.env.COZE_CLIENT_DEPLOY_HOOK_URL;
  if (!hookUrl) return "unconfigured";
  return (await attemptDeployTrigger(hookUrl)) ? "fired" : "clean";
};

// `affectsSite` lets callers skip the rebuild (and the "Publishing to
// coze.care" status that comes with it) for edits the public site can't
// see — e.g. saving an itinerary that was a draft and stays a draft.
const triggerCozeClientDeploy = async (affectsSite: boolean = true) => {
  if (!affectsSite) return;
  const hookUrl = process.env.COZE_CLIENT_DEPLOY_HOOK_URL;
  if (!hookUrl) return;

  try {
    await markContentDirty();

    const fired = await attemptDeployTrigger(hookUrl);
    if (!fired) {
      // Suppressed by the debounce: re-attempt once the window expires
      // (post-response; Vercel keeps the function alive for `after`
      // callbacks). Best-effort fast path — if this dies, the cron sweep
      // still picks the dirty flag up.
      after(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, (DEPLOY_TRIGGER_DEBOUNCE_SECONDS + 5) * 1000),
        );
        try {
          await attemptDeployTrigger(hookUrl);
        } catch (error) {
          console.warn("[content-store] trailing deploy re-fire failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  } catch (error) {
    console.warn("[content-store] failed to trigger coze_client deploy", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

type ItineraryRow = typeof cmsItineraryTable.$inferSelect;
type ItinerarySummary = {
  slug: string;
  title: string;
  category: string;
  tag: string | null;
  tagColor: string | null;
  coverPath: string | null;
  published: boolean;
  updatedAt: Date;
};

// Convert a DB row into the contentObject shape the editor UI/fields system expects.
const itineraryRowToContentObject = (row: ItineraryRow) => {
  const schema = getSchemaByName(config.object, "itineraries");
  const raw = {
    title: row.title,
    slug: row.slug,
    category: row.category,
    tag: row.tag,
    tagColor: row.tagColor,
    cover: row.coverPath,
    published: row.published,
    body: row.body,
  };
  return deepMap(raw, schema.fields, (value, field) => {
    const type = field.type as string;
    return typeof type === "string" && readFns[type] ? readFns[type](value, field, config) : value;
  });
};

// Validate + transform a client-submitted contentObject, returning the fields
// ready to persist as DB columns.
const validateItineraryContentObject = (contentObject: Record<string, any>) => {
  const schema = getSchemaByName(config.object, "itineraries");
  const zodSchema = generateZodSchema(schema.fields);
  const result = zodSchema.safeParse(contentObject);
  if (!result.success) {
    const messages = result.error.errors.map((error) => {
      let message = error.message;
      if (error.path.length > 0) message = `${message} at ${error.path.join(".")}`;
      return message;
    });
    throw createHttpError(`Content validation failed: ${messages.join(", ")}`, 400);
  }

  const validated = deepMap(result.data, schema.fields, (value, field) => {
    const type = field.type as string;
    return typeof type === "string" && writeFns[type] ? writeFns[type](value, field, config) : value;
  });

  return sanitizeObject(JSON.parse(JSON.stringify(validated)));
};

const listItineraries = async (): Promise<ItinerarySummary[]> => {
  const rows = await db
    .select({
      slug: cmsItineraryTable.slug,
      title: cmsItineraryTable.title,
      category: cmsItineraryTable.category,
      tag: cmsItineraryTable.tag,
      tagColor: cmsItineraryTable.tagColor,
      coverPath: cmsItineraryTable.coverPath,
      published: cmsItineraryTable.published,
      updatedAt: cmsItineraryTable.updatedAt,
    })
    .from(cmsItineraryTable)
    // Most recently touched first — the list mirrors what the team is
    // actually working on (the wall view features the top item).
    .orderBy(desc(cmsItineraryTable.updatedAt));
  return rows;
};

const getItinerary = async (slug: string) => {
  const [row] = await db.select().from(cmsItineraryTable).where(eq(cmsItineraryTable.slug, slug)).limit(1);
  if (!row) return null;
  return { row, contentObject: itineraryRowToContentObject(row) };
};

const createItinerary = async (contentObject: Record<string, any>, userId: string) => {
  const fields = validateItineraryContentObject(contentObject);
  if (!fields.slug) throw createHttpError("Slug is required.", 400);

  const [existing] = await db
    .select({ id: cmsItineraryTable.id })
    .from(cmsItineraryTable)
    .where(eq(cmsItineraryTable.slug, fields.slug))
    .limit(1);
  if (existing) throw createHttpError(`An itinerary with slug "${fields.slug}" already exists.`, 409);

  const [row] = await db
    .insert(cmsItineraryTable)
    .values({
      slug: fields.slug,
      title: fields.title,
      category: fields.category,
      tag: fields.tag ?? null,
      tagColor: fields.tagColor ?? null,
      coverPath: fields.cover ?? null,
      published: fields.published ?? true,
      body: fields.body ?? "",
      updatedBy: userId,
    })
    .returning();

  // A new draft isn't on the site yet — nothing to publish.
  await triggerCozeClientDeploy(row.published);
  return { row, contentObject: itineraryRowToContentObject(row) };
};

const saveItinerary = async (slug: string, contentObject: Record<string, any>, userId: string) => {
  const fields = validateItineraryContentObject(contentObject);

  const [existing] = await db.select().from(cmsItineraryTable).where(eq(cmsItineraryTable.slug, slug)).limit(1);
  if (!existing) throw createHttpError(`Itinerary "${slug}" not found.`, 404);

  // Slug changes go through the dedicated rename operation, not a plain save,
  // since it has real consequences for published URLs.
  if (fields.slug && fields.slug !== slug) {
    throw createHttpError(`Use the rename operation to change an itinerary's slug.`, 400);
  }

  const [row] = await db
    .update(cmsItineraryTable)
    .set({
      title: fields.title,
      category: fields.category,
      tag: fields.tag ?? null,
      tagColor: fields.tagColor ?? null,
      coverPath: fields.cover ?? null,
      published: fields.published ?? true,
      body: fields.body ?? "",
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(cmsItineraryTable.slug, slug))
    .returning();

  // Rebuild if the site can see the change: the entry is published, was
  // just published, or was just unpublished. Draft-to-draft edits stay
  // private and shouldn't queue a publish.
  await triggerCozeClientDeploy(existing.published || row.published);
  return { row, contentObject: itineraryRowToContentObject(row) };
};

const renameItinerary = async (slug: string, newSlug: string, userId: string) => {
  const [existing] = await db.select().from(cmsItineraryTable).where(eq(cmsItineraryTable.slug, slug)).limit(1);
  if (!existing) throw createHttpError(`Itinerary "${slug}" not found.`, 404);

  const [conflict] = await db
    .select({ id: cmsItineraryTable.id })
    .from(cmsItineraryTable)
    .where(eq(cmsItineraryTable.slug, newSlug))
    .limit(1);
  if (conflict) throw createHttpError(`An itinerary with slug "${newSlug}" already exists.`, 409);

  // Move media before repointing the row, so if the Storage move fails we
  // haven't already renamed the slug out from under existing media.
  await renameMediaFolder(slug, newSlug);

  const oldPrefix = `${slug}/`;
  const newPrefix = `${newSlug}/`;
  const rewrittenCover = existing.coverPath?.startsWith(oldPrefix)
    ? newPrefix + existing.coverPath.slice(oldPrefix.length)
    : existing.coverPath;
  const rewrittenBody = existing.body.split(oldPrefix).join(newPrefix);

  const [row] = await db
    .update(cmsItineraryTable)
    .set({
      slug: newSlug,
      coverPath: rewrittenCover,
      body: rewrittenBody,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(cmsItineraryTable.slug, slug))
    .returning();

  // Renaming a draft only changes CMS-internal URLs.
  await triggerCozeClientDeploy(existing.published);
  return row;
};

const deleteItinerary = async (slug: string) => {
  const [row] = await db.delete(cmsItineraryTable).where(eq(cmsItineraryTable.slug, slug)).returning();
  if (!row) throw createHttpError(`Itinerary "${slug}" not found.`, 404);
  // Deleting a draft removes nothing from the site.
  await triggerCozeClientDeploy(row.published);
  return row;
};

const getHomepage = async () => {
  const [row] = await db.select().from(cmsHomepageContentTable).where(eq(cmsHomepageContentTable.id, 1)).limit(1);
  const data = (row?.data as Record<string, any>) ?? { title: "", description: "" };
  const schema = getSchemaByName(config.object, "homepage");
  return deepMap(data, schema.fields, (value, field) => {
    const type = field.type as string;
    return typeof type === "string" && readFns[type] ? readFns[type](value, field, config) : value;
  });
};

const saveHomepage = async (contentObject: Record<string, any>, userId: string) => {
  const schema = getSchemaByName(config.object, "homepage");
  const zodSchema = generateZodSchema(schema.fields);
  const result = zodSchema.safeParse(contentObject);
  if (!result.success) {
    const messages = result.error.errors.map((error) => {
      let message = error.message;
      if (error.path.length > 0) message = `${message} at ${error.path.join(".")}`;
      return message;
    });
    throw createHttpError(`Content validation failed: ${messages.join(", ")}`, 400);
  }

  const validated = deepMap(result.data, schema.fields, (value, field) => {
    const type = field.type as string;
    return typeof type === "string" && writeFns[type] ? writeFns[type](value, field, config) : value;
  });
  const data = sanitizeObject(JSON.parse(JSON.stringify(validated)));

  await db
    .insert(cmsHomepageContentTable)
    .values({ id: 1, data, updatedBy: userId })
    .onConflictDoUpdate({
      target: cmsHomepageContentTable.id,
      set: { data, updatedAt: new Date(), updatedBy: userId },
    });

  await triggerCozeClientDeploy();
  return data;
};

export {
  sweepDeployTrigger,
  listItineraries,
  getItinerary,
  createItinerary,
  saveItinerary,
  renameItinerary,
  deleteItinerary,
  getHomepage,
  saveHomepage,
};
