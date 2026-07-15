"use client";

import Link from "next/link";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoProvider } from "@/contexts/repo-context";
import { cmsConfig } from "@/lib/cms-config";

/**
 * Shell for the Supabase-native CMS pages. Session is already enforced by
 * the parent `(main)` layout — this just adds a lean nav, no real
 * owner/repo/branch concept since there's only ever one "site" now.
 *
 * Still wraps children in ConfigProvider/RepoProvider: several `fields/`
 * edit components (rich-text, image, file, reference) call `useConfig()`/
 * `useRepo()` unconditionally and throw without a provider — these are
 * dummy/inert values (no real owner/repo/branch lookups happen), just
 * enough to satisfy the hooks so the shared field-rendering system
 * (`components/entry/entry-form.tsx`) keeps working unmodified.
 */
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      value={{
        owner: "coze",
        repo: "cms",
        branch: "main",
        sha: "",
        version: "",
        object: cmsConfig,
      }}
    >
      <RepoProvider repo={{ id: 0, owner: "coze", ownerId: 0, repo: "cms", isPrivate: true }}>
        <div className="min-h-screen">
          <header className="border-b">
            <nav className="max-w-screen-lg mx-auto flex items-center gap-6 px-4 md:px-6 h-14">
              <span className="font-medium tracking-tight">Coze CMS</span>
              <Link href="/cms/itineraries" className="text-sm text-muted-foreground hover:text-foreground">
                Itineraries
              </Link>
              <Link href="/cms/homepage" className="text-sm text-muted-foreground hover:text-foreground">
                Homepage
              </Link>
            </nav>
          </header>
          <main className="max-w-screen-lg mx-auto p-4 md:p-6">{children}</main>
        </div>
      </RepoProvider>
    </ConfigProvider>
  );
}
