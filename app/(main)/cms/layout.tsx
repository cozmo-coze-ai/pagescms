"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Eye,
  Home,
  LayoutDashboard,
  Layers,
  LogOut,
  Map,
  Settings,
} from "lucide-react";
import { SITE_URL } from "@/lib/cms-config";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoProvider } from "@/contexts/repo-context";
import { useUser } from "@/contexts/user-context";
import { signOut } from "@/lib/auth-client";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cmsConfig } from "@/lib/cms-config";
import { cn } from "@/lib/utils";

/**
 * "Coze Studio" — the /cms shell wears the public site's identity (paper,
 * ink, curator gold, Lora) via the `.studio` theme class in globals.css.
 * The class goes on <html> so portaled dialogs/menus inherit it too.
 *
 * Layout is a Ghost-style workspace: a fixed left sidebar (every section one
 * click away, current user pinned at the bottom) with the page canvas to the
 * right. On small screens the sidebar folds into a compact top bar with a
 * horizontally scrollable nav row.
 *
 * Session is enforced by the parent `(main)` layout. Still wraps children in
 * ConfigProvider/RepoProvider: several `fields/` edit components call
 * `useConfig()`/`useRepo()` unconditionally and throw without a provider —
 * dummy/inert values, just enough to keep the shared field-rendering system
 * (`components/entry/entry-form.tsx`) working unmodified.
 */

const navItems = [
  { href: "/cms", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/cms/itineraries", label: "Itineraries", icon: Map },
  { href: "/cms/homepage", label: "Homepage", icon: Home },
  { href: "/cms/site-pages", label: "Site pages", icon: Layers },
  { href: "/cms/settings", label: "Settings", icon: Settings },
];

const isActive = (pathname: string | null, item: (typeof navItems)[number]) =>
  item.exact ? pathname === item.href : Boolean(pathname?.startsWith(item.href));

const Brand = () => (
  <Link href="/cms" className="font-serif text-base tracking-tight">
    Coze <span className="text-primary">CMS</span>
  </Link>
);

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, canWrite } = useUser();

  useEffect(() => {
    document.documentElement.classList.add("studio");
    return () => document.documentElement.classList.remove("studio");
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.assign("/sign-in");
  };

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
        <div className="flex min-h-screen bg-background text-foreground">
          {/* Desktop sidebar */}
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card/60 md:flex">
            <div className="flex h-14 items-center px-4">
              <Brand />
            </div>
            <nav className="flex-1 space-y-0.5 px-2 py-2">
              {navItems.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
              <a
                href={SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <ArrowUpRight className="h-4 w-4 shrink-0" />
                View site
              </a>
            </nav>
            {user && (
              <div className="flex items-center gap-2.5 border-t border-border px-3 py-3">
                <Avatar className="h-7 w-7">
                  <AvatarImage
                    src={`https://unavatar.io/${user.email}?fallback=false`}
                    alt={user.name || user.email}
                  />
                  <AvatarFallback className="bg-secondary text-[10px]">
                    {getInitialsFromName(user.name || user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium leading-tight">
                    {user.name || user.email}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                >
                  <LogOut />
                </Button>
              </div>
            )}
          </aside>

          <div className="min-w-0 flex-1">
            {/* Mobile top bar — not sticky: page-level toolbars (e.g. the
                itinerary editor's save bar) stick at top-0 on all sizes, so
                this scrolls away instead of stacking with them. */}
            <header className="border-b border-border bg-background md:hidden">
              <div className="flex h-11 items-center justify-between px-4">
                <Brand />
                <div className="flex items-center gap-1">
                  <a
                    href={SITE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View site"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={handleSignOut}
                    aria-label="Sign out"
                  >
                    <LogOut />
                  </Button>
                </div>
              </div>
              <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
                {navItems.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "shrink-0 rounded-md px-2.5 py-1 text-[13px] transition-colors",
                        active
                          ? "bg-secondary font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </header>

            <main className="mx-auto max-w-screen-xl px-4 py-4 md:px-8 md:py-6">
              {!canWrite && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-[13px] text-muted-foreground">
                  <Eye className="h-4 w-4 shrink-0" />
                  <span>
                    You have <span className="font-medium text-foreground">read-only</span>{" "}
                    (viewer) access — you can browse everything, but changes are disabled.
                  </span>
                </div>
              )}
              {children}
            </main>
          </div>
        </div>
      </RepoProvider>
    </ConfigProvider>
  );
}
