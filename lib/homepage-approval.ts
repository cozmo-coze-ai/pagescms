import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
}

// Include the downloaded image bytes, not only their temporary URL. A changed
// image or proposal must be checked again before the user confirms it.
export function homepageProposalDigest(input: {
  expectedCommit: string; rationale: string; edits: unknown[];
  images: { filename: string; bytes: Uint8Array }[];
}) {
  return createHash("sha256").update(canonical({ ...input, images: input.images.map((image) => ({
    filename: image.filename, sha256: createHash("sha256").update(image.bytes).digest("hex"),
  })) })).digest("hex");
}

function signature(payload: string, secret: string) {
  if (secret.length < 32) throw new Error("Homepage approval signing is not configured.");
  return createHmac("sha256", secret).update(`coze-homepage-check-v1:${payload}`).digest("base64url");
}

export function issueHomepageCheck(subject: string, digest: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ subject, digest, expires: now + 15 * 60_000 })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyHomepageCheck(token: string, subject: string, digest: string, secret: string, now = Date.now()) {
  if (token.length > 2000) return false;
  try {
    const [payload, supplied, extra] = token.split(".");
    if (!payload || !supplied || extra !== undefined) return false;
    const expected = Buffer.from(signature(payload, secret));
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const checked = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return checked.subject === subject && checked.digest === digest && typeof checked.expires === "number" && checked.expires > now;
  } catch { return false; }
}
