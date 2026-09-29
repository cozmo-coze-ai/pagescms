import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserRole } from "@/lib/admin";
import { homepageMcpEnabled } from "@/lib/homepage-mcp-config";
import { HomepageConsent } from "./consent";

export const metadata = { title: "Connect ChatGPT | COZE", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!homepageMcpEnabled()) notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") query.append(key, value);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/sign-in?redirect=${encodeURIComponent(`/homepage-connect?${query}`)}`);
  const role = await getUserRole(session.user);
  const wantsWrite = (query.get("scope") ?? "").split(" ").includes("homepage:write");
  return <main className="studio flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
    <section className="w-full max-w-md rounded-xl border bg-card p-5 sm:p-7">
      <p className="mb-2 text-sm text-muted-foreground">COZE Homepage Editor</p>
      <h1 className="font-serif text-2xl">Connect ChatGPT</h1>
      <p className="mt-3 break-all text-sm text-muted-foreground">Signed in as {session.user.email}</p>
      <p className="mt-4 text-sm">ChatGPT can read the homepage{wantsWrite ? " and prepare design changes" : ""}.</p>
      {wantsWrite && <p className="mt-2 text-sm">Publishing and undoing changes still require your confirmation in chat.</p>}
      <p className="mt-2 text-sm text-muted-foreground">Access covers only the homepage. Your CMS account controls your permissions.</p>
      <HomepageConsent query={query.toString()} allowed={!!role && (!wantsWrite || role !== "viewer")} />
    </section>
  </main>;
}
