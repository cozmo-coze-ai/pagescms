import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cmsGptKeyTable, userTable } from "@/db/schema";
import { createHttpError } from "@/lib/api-error";

// ChatGPT editor authentication. Each person has their own key, issued and
// revoked in admin.coze.care (see /api/agent/admin/keys). Only its SHA-256 is
// stored. COZE_GPT_ACTION_TOKEN still works as a single shared fallback key.

const KEY_PREFIX = "coze_gpt_";
const editors = new WeakMap<Request, { label: string; keyId: string | null }>();

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function equalSecret(supplied: string, configured: string) {
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}

const bearer = (request: Request) => {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

export async function requireGptAction(request: Request): Promise<Response | null> {
  const supplied = bearer(request);
  const shared = process.env.COZE_GPT_ACTION_TOKEN;
  if (shared && shared.length >= 32 && equalSecret(supplied, shared)) {
    editors.set(request, { label: "shared key", keyId: null });
    return null;
  }
  if (supplied.startsWith(KEY_PREFIX)) {
    const [key] = await db.select({ id: cmsGptKeyTable.id, label: cmsGptKeyTable.label, lastUsedAt: cmsGptKeyTable.lastUsedAt })
      .from(cmsGptKeyTable)
      .where(and(eq(cmsGptKeyTable.keyHash, sha256(supplied)), isNull(cmsGptKeyTable.revokedAt)))
      .limit(1);
    if (key) {
      editors.set(request, { label: key.label, keyId: key.id });
      if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 5 * 60_000) {
        await db.update(cmsGptKeyTable).set({ lastUsedAt: new Date() }).where(eq(cmsGptKeyTable.id, key.id));
      }
      return null;
    }
  }
  return Response.json({ error: "Unauthorized. The API key is missing, wrong or revoked — ask the COZE admin for a new one." }, { status: 401 });
}

// The CMS user every GPT write is attributed to (a database reference), plus
// the person whose key made the change (recorded as the author).
export async function resolveGptActor(request: Request) {
  const actorEmail = process.env.COZE_GPT_ACTION_ACTOR_EMAIL?.trim().toLowerCase();
  if (!actorEmail) throw createHttpError("GPT Action editor identity is not configured.", 503);
  const [actor] = await db.select({ id: userTable.id }).from(userTable)
    .where(eq(userTable.email, actorEmail)).limit(1);
  if (!actor) throw createHttpError("GPT Action editor identity was not found in CMS.", 503);
  const editor = editors.get(request)?.label ?? "shared key";
  return { actorId: actor.id, actorEmail, author: `ChatGPT (${editor})` };
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw createHttpError("Request is too large.", 413);
  try {
    return await request.json();
  } catch {
    throw createHttpError("Request body must be JSON.", 400);
  }
}

// admin.coze.care's server calls the key-management routes with this secret.
export function requireAdminPanel(request: Request): Response | null {
  const configured = process.env.COZE_ADMIN_PANEL_SECRET;
  if (!configured || configured.length < 32) {
    return Response.json({ error: "Admin panel access is not configured on the CMS (COZE_ADMIN_PANEL_SECRET)." }, { status: 503 });
  }
  return equalSecret(bearer(request), configured) ? null : Response.json({ error: "Unauthorized." }, { status: 401 });
}

export async function listGptKeys() {
  return db.select({
    id: cmsGptKeyTable.id,
    label: cmsGptKeyTable.label,
    prefix: cmsGptKeyTable.prefix,
    createdBy: cmsGptKeyTable.createdBy,
    createdAt: cmsGptKeyTable.createdAt,
    lastUsedAt: cmsGptKeyTable.lastUsedAt,
    revokedAt: cmsGptKeyTable.revokedAt,
  }).from(cmsGptKeyTable).orderBy(desc(cmsGptKeyTable.createdAt));
}

/** Creates a key and returns it in full — the only time it is ever visible. */
export async function createGptKey(label: string, createdBy: string) {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = crypto.randomUUID();
  await db.insert(cmsGptKeyTable).values({
    id, label, createdBy, prefix: key.slice(0, KEY_PREFIX.length + 6), keyHash: sha256(key),
  });
  return { id, label, key };
}

export async function revokeGptKey(id: string) {
  const [row] = await db.update(cmsGptKeyTable).set({ revokedAt: new Date() })
    .where(and(eq(cmsGptKeyTable.id, id), isNull(cmsGptKeyTable.revokedAt)))
    .returning({ id: cmsGptKeyTable.id });
  if (!row) throw createHttpError("Key not found or already revoked.", 404);
  return row;
}
