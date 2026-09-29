import "server-only";

// ChatGPT homepage editor: validate a change against the rules, commit it to
// the production branch, and keep a history entry (cms_proposal, kind
// "homepage_design") so every change can be listed, tracked and undone.

import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod/v3";
import { db } from "@/db";
import { cmsProposalTable, cmsProposalVersionTable } from "@/db/schema";
import { createHttpError } from "@/lib/api-error";
import {
  applyEdits, homepageErrors, HOME_IMAGE_DIR, HOME_TEXT_FILES, imageInfo, imageNameError, summarizeChange, type TextEdit,
} from "@/lib/homepage-guard";
import {
  buildState, changedPaths, commitFiles, headCommit, listImages, readBytes, readTextFiles, requireGitDeploy, SITE_URL, type FileWrite,
} from "@/lib/homepage-git";

const MAX_CHANGES_PER_HOUR = 10;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_IMAGE_SIDE = 4000;

export const textEditSchema = z.union([
  z.object({ path: z.string(), content: z.string().max(80_000) }).strict(),
  z.object({ path: z.string(), find: z.string().min(1).max(20_000), replace: z.string().max(40_000) }).strict(),
]);

// ChatGPT sends files attached in the chat as `openaiFileIdRefs`.
export const openaiFileRefSchema = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  mime_type: z.string().optional(),
  download_link: z.string().url(),
}).passthrough();

type ChangeRecord = {
  commit: string;
  parentCommit: string;
  url: string;
  files: string[];
  undoOf?: string;
};

export type NewImage = { filename: string; bytes: Uint8Array };

async function enforceRateLimit() {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db.select({ id: cmsProposalTable.id }).from(cmsProposalTable)
    .where(and(eq(cmsProposalTable.kind, "homepage_design"), eq(cmsProposalTable.status, "published"), gte(cmsProposalTable.createdAt, since)));
  if (recent.length >= MAX_CHANGES_PER_HOUR) {
    throw createHttpError(`At most ${MAX_CHANGES_PER_HOUR} homepage changes per hour (each one rebuilds the site). Combine edits into one change.`, 429);
  }
}

// Only ChatGPT's own file host: never fetch arbitrary URLs from the server.
export async function downloadChatGptImage(link: string) {
  const url = new URL(link);
  if (url.protocol !== "https:" || !(url.hostname.endsWith(".oaiusercontent.com") || url.hostname === "files.openai.com")) {
    throw createHttpError("Images must be attached in ChatGPT (openaiFileIdRefs).", 400);
  }
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw createHttpError(`Could not download the attached image (${response.status}).`, 400);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes;
}

export function checkImage(filename: string, bytes: Uint8Array) {
  const nameError = imageNameError(filename);
  if (nameError) throw createHttpError(nameError, 400);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw createHttpError(`${filename} is larger than 2 MB. Compress it (WebP or JPEG) and attach it again.`, 400);
  const info = imageInfo(bytes);
  if (!info) throw createHttpError(`${filename} is not a PNG, JPEG or WebP image.`, 400);
  const extension = filename.split(".").pop();
  const expected = info.type === "jpeg" ? ["jpg", "jpeg"] : [info.type];
  if (!extension || !expected.includes(extension)) throw createHttpError(`${filename} is a ${info.type.toUpperCase()} image; use a .${expected[0]} filename.`, 400);
  if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
    throw createHttpError(`${filename} is ${info.width}×${info.height}; keep each side at most ${MAX_IMAGE_SIDE}px.`, 400);
  }
  return info;
}

async function beginRecord(input: { change: ChangeRecord; rationale: string; author: string }) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(cmsProposalTable).values({
      id, kind: "homepage_design", target: "homepage", status: "draft",
    });
    await tx.insert(cmsProposalVersionTable).values({
      proposalId: id, version: 1, content: input.change, rationale: input.rationale, author: input.author,
    });
  });
  return id;
}

async function finalizeRecord(id: string, change: ChangeRecord, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.update(cmsProposalVersionTable).set({ content: change })
      .where(and(eq(cmsProposalVersionTable.proposalId, id), eq(cmsProposalVersionTable.version, 1)));
    await tx.update(cmsProposalTable).set({
      status: "published", publishedAt: new Date(), publishedBy: actorId, updatedAt: new Date(),
    }).where(eq(cmsProposalTable.id, id));
  });
}

type ChangeInput = { expectedCommit: string; edits: TextEdit[]; images: NewImage[] };

// Validate a change against the live files and describe it, without writing.
async function prepareHomepageChange(input: ChangeInput) {
  if (input.edits.length === 0 && input.images.length === 0) throw createHttpError("Nothing to change: send edits and/or images.", 400);
  const head = await headCommit();
  if (head !== input.expectedCommit) {
    throw createHttpError("The homepage changed since it was read. Read it again, then re-apply the change.", 409);
  }
  const before = await readTextFiles(head);
  const after = new Map(before);
  const editErrors = applyEdits(after, input.edits);
  if (editErrors.length) throw createHttpError(editErrors.join("\n"), 400);

  const existing = new Set((await listImages(head)).map((image) => image.sitePath));
  const writes: FileWrite[] = [];
  for (const image of input.images) {
    checkImage(image.filename, image.bytes);
    const path = `${HOME_IMAGE_DIR}/${image.filename}`;
    existing.add(path.slice("public".length));
    writes.push({ path, bytes: image.bytes });
  }
  const errors = homepageErrors(before, after, (sitePath) => existing.has(sitePath));
  if (errors.length) throw createHttpError(`The change was not applied:\n- ${errors.join("\n- ")}`, 400);

  for (const path of HOME_TEXT_FILES) {
    if (after.get(path) !== before.get(path)) writes.push({ path, text: after.get(path) });
  }
  if (writes.length === 0) throw createHttpError("The edits do not change anything.", 400);
  return { head, writes, summary: summarizeChange(before, after, input.images.map((image) => `/home/${image.filename}`), SITE_URL) };
}

/** Dry run: what would change, for the designer to confirm. Nothing is written. */
export async function checkHomepageChange(input: ChangeInput) {
  const { head, summary } = await prepareHomepageChange(input);
  return { ok: true as const, commit: head, summary };
}

export async function applyHomepageChange(input: ChangeInput & { rationale: string; author: string; actorId: string }) {
  requireGitDeploy();
  await enforceRateLimit();
  const { head, writes, summary } = await prepareHomepageChange(input);
  // Create durable recovery metadata before the external Git write. If Git or
  // finalization fails, operators can see the draft record and reconcile it.
  const pending: ChangeRecord = { commit: "", parentCommit: head, url: "", files: writes.map((write) => write.path) };
  const changeId = await beginRecord({ change: pending, rationale: input.rationale, author: input.author });
  const committed = await commitFiles(head, writes, `homepage: ${input.rationale.trim().split("\n")[0].slice(0, 120)}\n\nConfirmed in ChatGPT and applied by ${input.author}.`);
  const change: ChangeRecord = { commit: committed.commit, parentCommit: head, url: committed.url, files: writes.map((write) => write.path) };
  await finalizeRecord(changeId, change, input.actorId);
  return { changeId, ...change, summary, status: "queued" as const };
}

async function loadChange(id: string) {
  const [proposal] = await db.select().from(cmsProposalTable)
    .where(and(eq(cmsProposalTable.id, id), eq(cmsProposalTable.kind, "homepage_design"))).limit(1);
  const [version] = proposal
    ? await db.select().from(cmsProposalVersionTable).where(eq(cmsProposalVersionTable.proposalId, id))
      .orderBy(desc(cmsProposalVersionTable.version)).limit(1)
    : [];
  const change = version?.content as ChangeRecord | undefined;
  if (!proposal || !version || !change?.commit) throw createHttpError("Homepage change not found.", 404);
  return { proposal, version, change };
}

const summary = (item: Awaited<ReturnType<typeof loadChange>>) => ({
  changeId: item.proposal.id,
  undone: item.proposal.status === "closed",
  createdAt: item.proposal.createdAt,
  author: item.version.author,
  rationale: item.version.rationale,
  ...item.change,
});

export async function listHomepageChanges(limit = 20) {
  const proposals = await db.select({ id: cmsProposalTable.id }).from(cmsProposalTable)
    .where(eq(cmsProposalTable.kind, "homepage_design"))
    .orderBy(desc(cmsProposalTable.createdAt)).limit(Math.min(limit, 50) * 2);
  const items = await Promise.all(proposals.map((proposal) => loadChange(proposal.id).then(summary, () => null)));
  return items.filter((item) => item !== null).slice(0, limit);
}

export async function getHomepageChange(id: string) {
  const item = summary(await loadChange(id));
  return { ...item, build: await buildState(item.commit) };
}

/** Restore the files one change touched to how they were before it, as a new change. */
export async function undoHomepageChange(input: { id: string; rationale: string; author: string; actorId: string }) {
  requireGitDeploy();
  await enforceRateLimit();
  const target = await loadChange(input.id);
  if (target.proposal.status === "closed") throw createHttpError("This change was already undone.", 409);
  const head = await headCommit();
  const touchedSince = (await changedPaths(target.change.commit, head)).filter((path) => target.change.files.includes(path));
  if (touchedSince.length) {
    throw createHttpError(`Cannot undo safely: ${touchedSince.join(", ")} changed again after this change. Undo the later change first, or make a new change instead.`, 409);
  }
  const before = await readTextFiles(head);
  const after = new Map(before);
  const images = new Set((await listImages(head)).map((image) => image.sitePath));
  const writes: FileWrite[] = [];
  for (const path of target.change.files) {
    const previous = await readBytes(path, target.change.parentCommit);
    if (HOME_TEXT_FILES.includes(path)) {
      if (previous === null) throw createHttpError(`${path} did not exist before this change.`, 409);
      const text = new TextDecoder().decode(previous);
      after.set(path, text);
      writes.push({ path, text });
    } else if (previous === null) {
      images.delete(path.slice("public".length));
      writes.push({ path, delete: true });
    } else {
      images.add(path.slice("public".length));
      writes.push({ path, bytes: previous });
    }
  }
  const errors = homepageErrors(before, after, (sitePath) => images.has(sitePath));
  if (errors.length) throw createHttpError(`Undo would break the homepage:\n- ${errors.join("\n- ")}`, 409);

  const pending: ChangeRecord = { commit: "", parentCommit: head, url: "", files: writes.map((write) => write.path), undoOf: input.id };
  const changeId = await beginRecord({ change: pending, rationale: `Undo: ${input.rationale}`, author: input.author });
  const committed = await commitFiles(head, writes, `homepage: undo ${target.change.commit.slice(0, 7)} — ${input.rationale.trim().slice(0, 100)}\n\nUndone from ChatGPT by ${input.author}.`);
  const change: ChangeRecord = { commit: committed.commit, parentCommit: head, url: committed.url, files: writes.map((write) => write.path), undoOf: input.id };
  await finalizeRecord(changeId, change, input.actorId);
  await db.update(cmsProposalTable).set({ status: "closed", updatedAt: new Date() }).where(eq(cmsProposalTable.id, input.id));
  return { changeId, ...change, status: "queued" as const };
}
