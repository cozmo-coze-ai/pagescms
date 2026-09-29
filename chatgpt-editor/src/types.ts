import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
export interface Env {
  PUBLIC_ORIGIN: string; CF_ACCOUNT_ID: string; CF_API_TOKEN: string;
  PREVIEW_WORKER_TAG: string; PREVIEW_HOST_SUFFIX: string;
  PRODUCTION_WORKER_TAG: string;
  GITHUB_TOKEN: string; TEAM_MEMBERS_JSON: string;
  CMS_DATABASE?: { connectionString: string };
  ITINERARY_EDITORS_JSON?: string;
  ADDITIONAL_EDITORS_JSON?: string;
  PUBLIC_BUILD_TRIGGER_ID?: string;
  SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string;
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: any;
  EDITOR: { idFromName(name: string): any; get(id: any): { fetch(request: Request): Promise<Response> } };
}
export type Member = { id: string; name: string; keyHash: string; enabled: boolean };
export class PublicError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function fail(message: string, status = 400): never { throw new PublicError(message, status); }
export async function sha256(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
type AdditionalEditor = Member & { cmsUserId?: string };
function additionalEditors(env: Env, primary: Member[]): AdditionalEditor[] {
  // Add new people without replacing the original secret or reviving a removed
  // identity. Invalid supplemental configuration must not disable existing users.
  let records: unknown;
  try { records = JSON.parse(env.ADDITIONAL_EDITORS_JSON || "[]"); } catch { return []; }
  if (!Array.isArray(records)) return [];
  const valid = records.filter((r): r is AdditionalEditor => r && typeof r === "object"
    && typeof r.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(r.id)
    && typeof r.name === "string" && r.name.trim().length > 0 && r.name.length <= 100
    && typeof r.enabled === "boolean" && typeof r.keyHash === "string" && /^[a-f0-9]{64}$/.test(r.keyHash)
    && (r.cmsUserId === undefined || (typeof r.cmsUserId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(r.cmsUserId))));
  return valid.filter(r => !primary.some(p => p.id === r.id || p.keyHash === r.keyHash)
    && valid.filter(p => p.id === r.id || p.keyHash === r.keyHash).length === 1);
}
export function members(env: Env): Member[] {
  const primary: Member[] = JSON.parse(env.TEAM_MEMBERS_JSON || "[]");
  return [...primary, ...additionalEditors(env, primary)];
}
export function member(env: Env, id: string) { return members(env).find(m => m.enabled && m.id === id); }
export function cmsUser(env: Env, id: string): string | undefined {
  const primary: Member[] = JSON.parse(env.TEAM_MEMBERS_JSON || "[]");
  if (!primary.some(m => m.id === id)) {
    return additionalEditors(env, primary).find(m => m.id === id && m.enabled)?.cmsUserId;
  }
  const ids: Record<string, unknown> = JSON.parse(env.ITINERARY_EDITORS_JSON || "{}");
  return member(env, id) && Object.hasOwn(ids, id) && typeof ids[id] === "string" ? ids[id] as string : undefined;
}
