"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { clearToken, isAuthenticated } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import type { ReactNode } from "react";

const navItems = [
  { label: "Home", href: "/workspace" },
  { label: "Projects", href: "/projects" },
  { label: "Intelligence", href: "/intelligence" },
  { label: "Knowledge", href: "/knowledge" },
  { label: "Sources", href: "/sources" },
  { label: "Evidence", href: "/evidence" },
  { label: "Agents", href: "/agents" },
  { label: "Models", href: "/models" },
  { label: "Providers", href: "/providers" },
  { label: "Tools", href: "/tools" },
  { label: "Evaluations", href: "/evaluations" },
  { label: "Memory", href: "/memory" },
  { label: "Reports", href: "/reports" },
  { label: "Monitoring", href: "/monitoring" },
  { label: "Settings", href: "/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#d8e3f1_0,#eef3f7_35%,#f7f9fb_60%,#f8fafc_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">ONX Intelligence</p>
            <p className="text-sm font-semibold">Intelligence Workspace</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearToken();
              router.replace("/login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-3 p-3 md:grid-cols-[220px_minmax(0,1fr)_300px] md:p-4">
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
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-h-[520px] rounded-lg border border-slate-200 bg-white p-4">{children}</main>

        <aside className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Context Panel</p>
          <p className="mt-3 text-sm text-slate-700">
            Active domain: <span className="font-semibold">{pathname}</span>
          </p>
          <p className="mt-2 text-sm text-slate-600">
            This panel is reserved for domain context, active filters, ownership scope, and run mode.
          </p>
        </aside>
      </div>

      <footer className="mx-auto mb-4 mt-1 max-w-[1800px] rounded-lg border border-slate-200 bg-white px-4 py-3 md:px-6">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Execution Timeline</p>
        <p className="mt-1 text-sm text-slate-700">
          Workspace initialized. Fetching live intelligence domains from production API.
        </p>
      </footer>
    </div>
  );
}
