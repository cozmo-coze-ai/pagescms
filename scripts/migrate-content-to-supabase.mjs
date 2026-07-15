#!/usr/bin/env node
// One-time migration: copy content out of the `coze_cms` git repo (itinerary
// markdown + homepage.json + media) into Supabase (cms_itinerary,
// cms_homepage_content tables + the itineraries-media Storage bucket).
//
// Safe to re-run: upserts by slug, and re-uploads media (Storage `upsert`).
// Do not run this against a database that pagescms's editor is already
// writing to for real content, without checking for conflicts first.
//
// Usage:
//   node scripts/migrate-content-to-supabase.mjs            # dry run (default)
//   node scripts/migrate-content-to-supabase.mjs --apply     # actually write
//
// Source resolution mirrors coze_client/scripts/fetch-content.mjs:
//   1. COZE_CONTENT_DIR env — path to a local coze_cms checkout
//   2. ../coze_cms sibling checkout, if present
//   3. shallow git clone of CONTENT_REPO (default cozmo-coze-ai/coze_cms)
//
// Requires env vars: SG_DATABASE_URL_UNPOOLED (or DATABASE_URL),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLONE_DIR = path.join(ROOT, ".migration-tmp", "repo");
const BUCKET = "itineraries-media";
const APPLY = process.argv.includes("--apply");

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function resolveSource() {
  const envDir = process.env.COZE_CONTENT_DIR;
  if (envDir) {
    if (!fs.existsSync(path.join(envDir, "content"))) {
      throw new Error(`COZE_CONTENT_DIR has no content/ directory: ${envDir}`);
    }
    return { dir: envDir, label: `COZE_CONTENT_DIR (${envDir})` };
  }

  const sibling = path.resolve(ROOT, "..", "coze_cms");
  if (fs.existsSync(path.join(sibling, "content"))) {
    return { dir: sibling, label: `sibling checkout (${sibling})` };
  }

  const repo = process.env.CONTENT_REPO ?? "cozmo-coze-ai/coze_cms";
  const token = process.env.CONTENT_REPO_TOKEN;
  const url = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;

  fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true });
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--branch", process.env.CONTENT_REPO_BRANCH ?? "main", url, CLONE_DIR],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return { dir: CLONE_DIR, label: `clone of ${repo}` };
}

// Minimal yaml-frontmatter parser matching lib/serialization.ts's default
// ("---\n...\n---\n<body>") — the only format coze_cms's .pages.yml uses.
function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/.exec(content);
  if (!match) return { body: content };
  const frontmatter = YAML.parse(match[1], { strict: false, uniqueKeys: false }) || {};
  const body = (match[2] || "").replace(/^\r?\n/, "");
  return { ...frontmatter, body };
}

// Supabase Storage rejects object keys with non-ASCII/special characters
// (several source filenames have Korean text, fullwidth chars, parentheses,
// spaces). Sanitize to a safe key, preserving the extension, only when the
// original name isn't already safe — keeps already-uploaded keys stable
// across re-runs.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;
function sanitizeFilename(filename) {
  if (SAFE_FILENAME.test(filename)) return filename;
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safeBase || "file"}${ext}`;
}

async function main() {
  console.log(APPLY ? "[migrate] mode: APPLY (writing to Supabase)" : "[migrate] mode: DRY RUN (no writes — pass --apply to write)");

  const { dir, label } = resolveSource();
  console.log(`[migrate] source: ${label}`);

  const itinerariesDir = path.join(dir, "content", "itineraries");
  const homepagePath = path.join(dir, "content", "homepage.json");
  const mediaDir = path.join(dir, "media", "itineraries");

  const mdFiles = fs.readdirSync(itinerariesDir).filter((f) => f.endsWith(".md"));
  console.log(`[migrate] found ${mdFiles.length} itinerary markdown files`);

  const parsed = [];
  const slugMismatches = [];
  for (const filename of mdFiles) {
    const filePath = path.join(itinerariesDir, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    const fields = parseFrontmatter(content);
    const filenameSlug = filename.replace(/\.md$/, "");
    if (fields.slug && fields.slug !== filenameSlug) {
      slugMismatches.push({ filename, filenameSlug, frontmatterSlug: fields.slug });
    }
    parsed.push({ filename, fields });
  }

  if (slugMismatches.length > 0) {
    console.warn(`[migrate] WARNING: ${slugMismatches.length} file(s) where filename != frontmatter slug (using frontmatter slug as source of truth):`);
    for (const m of slugMismatches) console.warn(`  ${m.filename}: filename="${m.filenameSlug}" frontmatter="${m.frontmatterSlug}"`);
  }

  const homepageData = fs.existsSync(homepagePath) ? JSON.parse(fs.readFileSync(homepagePath, "utf-8")) : null;
  if (!homepageData) console.warn("[migrate] WARNING: content/homepage.json not found, skipping homepage migration");

  const mediaFolders = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter((f) => fs.statSync(path.join(mediaDir, f)).isDirectory()) : [];
  let mediaFileCount = 0;
  const mediaByFolder = {};
  // Map original filename -> sanitized filename, per folder (slug). Used to
  // rewrite Storage keys and any references to them in cover/body text.
  const renamesByFolder = {};
  for (const folder of mediaFolders) {
    const files = fs.readdirSync(path.join(mediaDir, folder)).filter((f) => fs.statSync(path.join(mediaDir, folder, f)).isFile());
    mediaByFolder[folder] = files;
    mediaFileCount += files.length;
    const renames = {};
    for (const file of files) {
      const safe = sanitizeFilename(file);
      if (safe !== file) renames[file] = safe;
    }
    renamesByFolder[folder] = renames;
  }
  const totalRenames = Object.values(renamesByFolder).reduce((n, r) => n + Object.keys(r).length, 0);
  console.log(`[migrate] found ${mediaFileCount} media files across ${mediaFolders.length} folders (${totalRenames} filenames need sanitizing)`);

  if (!APPLY) {
    console.log("\n[migrate] --- Dry run summary ---");
    console.log(`  itineraries to insert/update: ${parsed.length}`);
    console.log(`  homepage: ${homepageData ? "1 row" : "skipped (not found)"}`);
    console.log(`  media objects to upload: ${mediaFileCount}`);
    console.log(`  slug/filename mismatches: ${slugMismatches.length}`);
    console.log("\n[migrate] Re-run with --apply to write these to Supabase.");
    return;
  }

  const dbUrl = process.env.SG_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("Missing SG_DATABASE_URL_UNPOOLED or DATABASE_URL.");
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");

  const sql = postgres(dbUrl, { max: 1 });
  const storage = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  let itineraryCount = 0;
  for (const { filename, fields } of parsed) {
    const slug = fields.slug || filename.replace(/\.md$/, "");
    const renames = renamesByFolder[slug] || {};

    // Apply any filename sanitization to references inside body/cover so
    // they keep resolving to the (possibly renamed) Storage object.
    let body = fields.body ?? "";
    for (const [original, safe] of Object.entries(renames)) {
      body = body.split(original).join(safe);
    }

    // cover frontmatter is `/itineraries/<slug>/<file>` — cover_path stores
    // just `<slug>/<file>` (the bucket-relative key media-store.ts/
    // fetch-content.mjs expect), and picks up the same sanitized filename.
    let coverPath = null;
    if (fields.cover) {
      const match = /^\/itineraries\/([^/]+)\/(.+)$/.exec(fields.cover);
      if (match) {
        const [, coverSlug, coverFile] = match;
        const safeCoverFile = (renamesByFolder[coverSlug] || {})[coverFile] ?? coverFile;
        coverPath = `${coverSlug}/${safeCoverFile}`;
      } else {
        console.warn(`[migrate] WARNING: unexpected cover format for "${slug}": ${fields.cover}`);
        coverPath = fields.cover.replace(/^\//, "");
      }
    }

    await sql`
      insert into cms_itinerary (slug, title, category, tag, tag_color, cover_path, published, body)
      values (${slug}, ${fields.title ?? ""}, ${fields.category ?? ""}, ${fields.tag ?? null}, ${fields.tagColor ?? null}, ${coverPath}, ${fields.published ?? true}, ${body})
      on conflict (slug) do update set
        title = excluded.title,
        category = excluded.category,
        tag = excluded.tag,
        tag_color = excluded.tag_color,
        cover_path = excluded.cover_path,
        published = excluded.published,
        body = excluded.body,
        updated_at = now()
    `;
    itineraryCount++;
  }
  console.log(`[migrate] upserted ${itineraryCount} itinerary rows`);

  if (homepageData) {
    await sql`
      insert into cms_homepage_content (id, data)
      values (1, ${sql.json(homepageData)})
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
    console.log("[migrate] upserted homepage_content row");
  }

  let uploadedCount = 0;
  let uploadErrors = 0;
  for (const [folder, files] of Object.entries(mediaByFolder)) {
    const renames = renamesByFolder[folder] || {};
    for (const filename of files) {
      const safeFilename = renames[filename] ?? filename;
      const filePath = path.join(mediaDir, folder, filename);
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(safeFilename).toLowerCase();
      const { error } = await storage.storage.from(BUCKET).upload(`${folder}/${safeFilename}`, buffer, {
        contentType: CONTENT_TYPES[ext],
        upsert: true,
      });
      if (error) {
        uploadErrors++;
        console.error(`[migrate] failed to upload ${folder}/${safeFilename} (was "${filename}"): ${error.message}`);
      } else {
        uploadedCount++;
      }
    }
  }
  console.log(`[migrate] uploaded ${uploadedCount}/${mediaFileCount} media objects (${uploadErrors} errors)`);

  console.log("\n[migrate] --- Verification ---");
  const [{ count: dbItineraryCount }] = await sql`select count(*)::int as count from cms_itinerary`;
  console.log(`  cms_itinerary rows: ${dbItineraryCount} (source files: ${mdFiles.length})`);
  if (dbItineraryCount < mdFiles.length) console.warn("  WARNING: fewer DB rows than source files — investigate before trusting this migration.");
  if (uploadErrors > 0) console.warn(`  WARNING: ${uploadErrors} media upload(s) failed — see errors above.`);

  await sql.end();
  console.log("\n[migrate] done.");
}

main().catch((error) => {
  console.error("[migrate] fatal error:", error);
  process.exitCode = 1;
});
