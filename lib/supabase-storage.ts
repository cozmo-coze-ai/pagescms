import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var __pagesCmsSupabaseClient: SupabaseClient | undefined;
}

const getSupabaseStorageClient = () => {
  if (globalThis.__pagesCmsSupabaseClient) return globalThis.__pagesCmsSupabaseClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__pagesCmsSupabaseClient = client;
  }

  return client;
};

// Bucket name lives in lib/media-path.ts (client-safe module) so client
// components can build public URLs; re-exported here for server-side callers.
export { ITINERARIES_MEDIA_BUCKET } from "@/lib/media-path";

export { getSupabaseStorageClient };
