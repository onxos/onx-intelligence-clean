"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = Record<string, unknown>;

function normalize(data: unknown): Row[] {
  const d = data as { items?: Row[] } | Row[] | undefined;
  return Array.isArray(d) ? d : (d?.items ?? []);
}

function s(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function ViolationFeed() {
  // TODO(realtime): swap polling for a Socket.io `constitutional.violations` feed.
  const violations = useQuery({
    queryKey: ["constitutional", "violations"],
    queryFn: () => api.iurg.violations({ pageSize: 12 }),
    refetchInterval: 8_000,
  });
  const items = normalize(violations.data);

  return (
    <Card className="h-full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">Violation Feed</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#ef4444]" /> live
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {violations.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No violations recorded. System is compliant.</p>
        ) : (
          items.map((v, i) => (
            <div
              key={String(v.id ?? v.iurgId ?? i)}
              className="rounded-md border-l-2 border-[#ef4444] bg-[#fef2f2] px-3 py-2"
            >
              <p className="font-mono text-xs font-semibold text-[#991b1b]">
                {s(v.constraintRef ?? v.constraint, "VIOLATION")}
              </p>
              <p className="text-xs text-slate-600">
                {s(v.reason ?? v.detail, "Constraint violated")}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
