"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Settings } from "lucide-react";
import { SITE_URL } from "@/lib/cms-config";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoProvider } from "@/contexts/repo-context";
import { cmsConfig } from "@/lib/cms-config";
import { cn } from "@/lib/utils";

/**
 * "Coze Studio" — the /cms shell wears the public site's identity (paper,
 * ink, curator gold, Lora) via the `.studio` theme class in globals.css.
 * The class goes on <html> so portaled dialogs/menus inherit it too.
 *
 * Session is enforced by the parent `(main)` layout. Still wraps children in
 * ConfigProvider/RepoProvider: several `fields/` edit components call
 * `useConfig()`/`useRepo()` unconditionally and throw without a provider —
 * dummy/inert values, just enough to keep the shared field-rendering system
 * (`components/entry/entry-form.tsx`) working unmodified.
 */
export default function CmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.classList.add("studio");
    return () => document.documentElement.classList.remove("studio");
  }, []);

  const navItems = [
    { href: "/cms", label: "Home", exact: true },
    { href: "/cms/itineraries", label: "Itineraries" },
    { href: "/cms/homepage", label: "Homepage" },
  ];

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
        <div className="min-h-screen bg-background text-foreground">
          <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
            <nav className="mx-auto flex h-11 max-w-screen-xl items-center gap-5 px-4 md:px-6">
              <Link href="/cms" className="font-serif text-base tracking-tight">
                Coze <span className="text-primary">CMS</span>
              </Link>
              <div className="flex items-center gap-4">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "text-[13px] transition-colors hover:text-foreground",
                      (item.exact ? pathname === item.href : pathname?.startsWith(item.href))
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <a
                  href={SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  View site
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-screen-xl px-4 py-4 md:px-6 md:py-6">{children}</main>
        </div>
      </RepoProvider>
    </ConfigProvider>
  );
}
