import "server-only";

// GitHub side of the ChatGPT homepage editor: read the homepage files at the
// production branch head, and write a change as one fast-forward commit.
// Cloudflare Workers Builds deploys www.coze.care from that branch. Uses only
// fetch, so it runs on Vercel and Cloudflare Workers alike.

import { createHttpError } from "@/lib/api-error";
import { HOME_IMAGE_DIR, HOME_TEXT_FILES, isEditablePath } from "@/lib/homepage-guard";

const SHA = /^[a-f0-9]{40}$/;
export const SITE_URL = "https://www.coze.care";

function config() {
  // The production site repo on the cozmo@coze.care GitHub account.
  const repo = process.env.COZE_CLIENT_GITHUB_REPO ?? "cozmo-coze-ai/coze_client";
  const token = process.env.COZE_CLIENT_GITHUB_TOKEN;
  const branch = process.env.COZE_CLIENT_GITHUB_BRANCH ?? "main";
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw createHttpError("Homepage GitHub integration is not configured.", 503);
  }
  return { repo, token, branch };
}

export function requireGitDeploy() {
  if (process.env.COZE_CLIENT_CLOUDFLARE_GIT_DEPLOY_ENABLED !== "true") {
    throw createHttpError("Cloudflare Git deployment has not been verified and enabled.", 503);
  }
}

async function github<T>(path: string, init?: { method?: string; body?: unknown; allow404?: boolean }): Promise<T | null> {
  const { repo, token } = config();
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "coze-cms-homepage-editor",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (response.status === 404 && init?.allow404) return null;
  if (!response.ok) {
    // Do not echo a GitHub error body, which can include private repo details.
    throw createHttpError(`GitHub operation failed (${response.status}).`, response.status === 409 || response.status === 422 ? 409 : 502);
  }
  return response.json() as Promise<T>;
}

const must = <T>(value: T | null): T => {
  if (value === null) throw createHttpError("GitHub returned no data.", 502);
  return value;
};

export async function headCommit() {
  const { branch } = config();
  const ref = must(await github<{ object: { sha: string } }>(`/git/ref/heads/${branch}`));
  if (!SHA.test(ref.object.sha)) throw createHttpError("GitHub returned an invalid commit SHA.", 502);
  return ref.object.sha;
}

type ContentFile = { type: string; path: string; sha: string; size: number; content?: string; encoding?: string };

/** Bytes of one file at `ref`, or null when it does not exist there. */
export async function readBytes(path: string, ref: string): Promise<Uint8Array | null> {
  if (!isEditablePath(path)) throw createHttpError(`"${path}" is not an editable homepage file.`, 400);
  const file = await github<ContentFile>(`/contents/${path}?ref=${ref}`, { allow404: true });
  if (!file) return null;
  if (file.type !== "file") throw createHttpError(`"${path}" is not a file.`, 400);
  // The contents API omits bodies over 1 MB; fetch those as a blob.
  const base64 = file.encoding === "base64" && file.content
    ? file.content
    : must(await github<{ content: string }>(`/git/blobs/${file.sha}`)).content;
  return Uint8Array.from(Buffer.from(base64.replace(/\s/g, ""), "base64"));
}

export async function readText(path: string, ref: string) {
  const bytes = await readBytes(path, ref);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** All editable text files at `ref`. */
export async function readTextFiles(ref: string) {
  const files = new Map<string, string>();
  await Promise.all(HOME_TEXT_FILES.map(async (path) => {
    const text = await readText(path, ref);
    if (text === null) throw createHttpError(`${path} is missing at ${ref.slice(0, 7)}.`, 502);
    files.set(path, text);
  }));
  return files;
}

export async function listImages(ref: string) {
  const entries = await github<ContentFile[]>(`/contents/${HOME_IMAGE_DIR}?ref=${ref}`, { allow404: true });
  return (entries ?? [])
    .filter((entry) => entry.type === "file" && !entry.path.endsWith("/.gitkeep"))
    .map((entry) => ({ path: entry.path, sitePath: entry.path.slice("public".length), size: entry.size }));
}

export type FileWrite = { path: string; text?: string; bytes?: Uint8Array; delete?: boolean };

/**
 * One commit on top of `expectedCommit`, then a fast-forward update of the
 * production branch. Anything else moving the branch first makes this fail
 * with 409 instead of overwriting it.
 */
export async function commitFiles(expectedCommit: string, writes: FileWrite[], message: string) {
  if (!SHA.test(expectedCommit)) throw createHttpError("expectedCommit must be a 40-character commit SHA.", 400);
  for (const write of writes) {
    if (!isEditablePath(write.path)) throw createHttpError(`"${write.path}" is not an editable homepage file.`, 400);
  }
  if (await headCommit() !== expectedCommit) {
    throw createHttpError("The homepage changed since it was read. Read it again, then re-apply the change.", 409);
  }
  const tree = await Promise.all(writes.map(async (write) => {
    if (write.delete) return { path: write.path, mode: "100644", type: "blob", sha: null };
    if (write.text !== undefined) return { path: write.path, mode: "100644", type: "blob", content: write.text };
    const blob = must(await github<{ sha: string }>("/git/blobs", {
      method: "POST",
      body: { content: Buffer.from(write.bytes ?? new Uint8Array()).toString("base64"), encoding: "base64" },
    }));
    return { path: write.path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const parent = must(await github<{ tree: { sha: string } }>(`/git/commits/${expectedCommit}`));
  const nextTree = must(await github<{ sha: string }>("/git/trees", {
    method: "POST",
    body: { base_tree: parent.tree.sha, tree },
  }));
  const commit = must(await github<{ sha: string }>("/git/commits", {
    method: "POST",
    body: { message, tree: nextTree.sha, parents: [expectedCommit] },
  }));
  const { branch, repo } = config();
  await github(`/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: commit.sha, force: false } });
  return { commit: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}` };
}

/** Paths changed between two commits (anyone's changes, not just ChatGPT's). */
export async function changedPaths(base: string, head: string) {
  if (base === head) return [];
  const comparison = must(await github<{ files?: { filename: string; previous_filename?: string }[] }>(`/compare/${base}...${head}`));
  return (comparison.files ?? []).flatMap((file) => [file.filename, file.previous_filename].filter((name): name is string => Boolean(name)));
}

export type BuildState = "queued" | "building" | "failed" | "deployed" | "live" | "superseded";

type CheckRun = { name: string; status: string; conclusion: string | null; details_url: string | null; output?: { title?: string | null; summary?: string | null } };
type CommitStatus = { state: string; statuses: { context: string; state: string; description: string | null; target_url: string | null }[] };

/** The commit the live homepage was built from (BaseLayout's coze-build meta). */
export async function liveCommit(): Promise<string | null> {
  try {
    const response = await fetch(`${SITE_URL}/?coze-build-check=${Date.now()}`, { cache: "no-store" });
    const html = await response.text();
    return /<meta name="coze-build" content="([a-f0-9]{7,40})"/.exec(html)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Where a commit is on its way to www.coze.care: Cloudflare's GitHub check
 * run for the build, then the live page's build marker. `superseded` means a
 * later commit is live and already contains this one.
 */
export async function buildState(commit: string): Promise<{ state: BuildState; detail: string | null; buildUrl: string | null }> {
  const [checks, statuses, live] = await Promise.all([
    github<{ check_runs: CheckRun[] }>(`/commits/${commit}/check-runs?per_page=50`),
    github<CommitStatus>(`/commits/${commit}/status`),
    liveCommit(),
  ]);
  if (live && commit.startsWith(live)) return { state: "live", detail: null, buildUrl: null };
  if (live) {
    const comparison = await github<{ status: string }>(`/compare/${commit}...${live}`, { allow404: true });
    if (comparison?.status === "ahead") return { state: "superseded", detail: `A later change (${live.slice(0, 7)}) is live and includes this one.`, buildUrl: null };
  }
  const runs = (checks?.check_runs ?? []).filter((run) => /cloudflare|workers/i.test(run.name));
  const failed = runs.find((run) => run.status === "completed" && run.conclusion !== "success" && run.conclusion !== "neutral" && run.conclusion !== "skipped");
  if (failed) {
    const detail = [failed.output?.title, failed.output?.summary].filter(Boolean).join(" — ").slice(0, 1500) || "The Cloudflare build failed.";
    return { state: "failed", detail, buildUrl: failed.details_url };
  }
  const legacy = (statuses?.statuses ?? []).filter((status) => /cloudflare|workers/i.test(status.context));
  const legacyFailed = legacy.find((status) => status.state === "failure" || status.state === "error");
  if (legacyFailed) return { state: "failed", detail: legacyFailed.description ?? "The Cloudflare build failed.", buildUrl: legacyFailed.target_url };
  if (runs.some((run) => run.status !== "completed") || legacy.some((status) => status.state === "pending")) {
    return { state: "building", detail: null, buildUrl: runs[0]?.details_url ?? legacy[0]?.target_url ?? null };
  }
  if (runs.length > 0 || legacy.some((status) => status.state === "success")) {
    return { state: "deployed", detail: "Build finished; waiting for www.coze.care to serve it.", buildUrl: runs[0]?.details_url ?? null };
  }
  return { state: "queued", detail: "No Cloudflare build has reported on this commit yet.", buildUrl: null };
}
