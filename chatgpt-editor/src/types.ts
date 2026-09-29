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
export function members(env: Env): Member[] { return JSON.parse(env.TEAM_MEMBERS_JSON || "[]"); }
export function member(env: Env, id: string) { return members(env).find(m => m.enabled && m.id === id); }
export function cmsUser(env: Env, id: string): string | undefined {
  const ids: Record<string, unknown> = JSON.parse(env.ITINERARY_EDITORS_JSON || "{}");
  return member(env, id) && Object.hasOwn(ids, id) && typeof ids[id] === "string" ? ids[id] as string : undefined;
}
