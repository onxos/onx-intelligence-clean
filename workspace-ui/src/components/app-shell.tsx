"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Languages, LogOut } from "lucide-react";
import { clearToken, isAuthenticated } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rememberLanguage, rememberLayout, rememberPage, readWorkspaceMemory } from "@/lib/workspace-memory";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const navItems = [
  { labelKey: "nav.home", href: "/workspace" },
  { labelKey: "nav.projects", href: "/projects" },
  { labelKey: "nav.intelligence", href: "/intelligence" },
  { labelKey: "nav.knowledge", href: "/knowledge" },
  { labelKey: "nav.sources", href: "/sources" },
  { labelKey: "nav.evidence", href: "/evidence" },
  { labelKey: "nav.agents", href: "/agents" },
  { labelKey: "nav.models", href: "/models" },
  { labelKey: "nav.providers", href: "/providers" },
  { labelKey: "nav.tools", href: "/tools" },
  { labelKey: "nav.evaluations", href: "/evaluations" },
  { labelKey: "nav.memory", href: "/memory" },
  { labelKey: "nav.capital", href: "/capital" },
  { labelKey: "nav.reports", href: "/reports" },
  { labelKey: "nav.monitoring", href: "/monitoring" },
  { labelKey: "nav.settings", href: "/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale, t, isRtl, direction } = useI18n();
  const [layout, setLayout] = useState<"comfortable" | "compact">(
    () => readWorkspaceMemory().layout || "comfortable",
  );

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!pathname) return;
    rememberPage(pathname);
  }, [pathname]);

  const memorySnapshot = readWorkspaceMemory();

  const compactClass = layout === "compact" ? "gap-2 p-2 md:p-3" : "gap-3 p-3 md:p-4";

  const recentActivity = useMemo(() => memorySnapshot.navHistory.slice(0, 5), [memorySnapshot.navHistory]);
  const recentAssets = useMemo(() => memorySnapshot.recentAssets.slice(0, 5), [memorySnapshot.recentAssets]);
  const recentSearches = useMemo(
    () => memorySnapshot.recentSearches.slice(0, 4),
    [memorySnapshot.recentSearches],
  );

  return (
    <div dir={direction} className="min-h-screen bg-[radial-gradient(circle_at_top_right,#d8e3f1_0,#eef3f7_35%,#f7f9fb_60%,#f8fafc_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("brand.product")}</p>
            <p className="text-sm font-semibold">{t("brand.workspace")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = locale === "en" ? "ar" : "en";
                setLocale(next);
                rememberLanguage(next);
              }}
            >
              <Languages className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
              {t("common.language")}: {locale.toUpperCase()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = layout === "comfortable" ? "compact" : "comfortable";
                setLayout(next);
                rememberLayout(next);
              }}
            >
              {t("common.layout")}: {layout === "comfortable" ? t("common.comfortable") : t("common.compact")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearToken();
                router.replace("/login");
              }}
            >
              <LogOut className={cn("h-4 w-4", isRtl ? "ml-2" : "mr-2")} />
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <div className={cn("mx-auto grid max-w-[1800px] grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_300px]", compactClass)}>
        <aside className="rounded-lg border border-slate-200 bg-white p-2">
          <nav className="grid gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-h-[520px] rounded-lg border border-slate-200 bg-white p-4">{children}</main>

        <aside className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{t("common.contextPanel")}</p>
          <p className="mt-3 text-sm text-slate-700">
            {t("common.activeDomain")}: <span className="font-semibold">{pathname}</span>
          </p>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t("common.recentActivity")}</p>
              {recentActivity.length ? (
                <ul className="space-y-1 text-slate-700">
                  {recentActivity.map((entry) => (
                    <li key={entry} className="truncate">{entry}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">{t("common.noRecentActivity")}</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t("common.recentAssets")}</p>
              {recentAssets.length ? (
                <ul className="space-y-1 text-slate-700">
                  {recentAssets.map((asset) => (
                    <li key={`${asset.domain}-${asset.id}`} className="truncate">
                      {asset.domain}: {asset.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">{t("common.noRecentAssets")}</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t("common.recentSearches")}</p>
              {recentSearches.length ? (
                <ul className="space-y-1 text-slate-700">
                  {recentSearches.map((item) => (
                    <li key={item} className="truncate">{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">{t("common.noRecentSearches")}</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("common.role")}</p>
              <p className="text-slate-700">{t("common.unknown")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("common.project")}</p>
              <p className="text-slate-700">{memorySnapshot.lastProject || "-"}</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="mx-auto mb-4 mt-1 max-w-[1800px] rounded-lg border border-slate-200 bg-white px-4 py-3 md:px-6">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{t("common.executionTimeline")}</p>
        <p className="mt-1 text-sm text-slate-700">
          {t("common.workspaceInitialized")}
        </p>
      </footer>
    </div>
  );
}
