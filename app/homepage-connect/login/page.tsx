import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { HOMEPAGE_AUTH_PATH, homepageMcpEnabled } from "@/lib/homepage-mcp-config";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!homepageMcpEnabled()) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string" && key !== "sig" && key !== "exp") query.set(key, value);
  }
  // Re-enter authorize after normal CMS login; the provider validates all
  // client, callback, scope, resource and PKCE parameters again.
  query.delete("prompt");
  const resume = `${HOMEPAGE_AUTH_PATH}/oauth2/authorize?${query}`;
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session?.user ? resume : `/sign-in?redirect=${encodeURIComponent(resume)}`);
}
