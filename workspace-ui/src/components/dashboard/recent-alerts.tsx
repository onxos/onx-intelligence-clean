"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AlertItem {
  id: string;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "info";
  at?: string;
}

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  const d = data as { items?: Row[] } | Row[] | undefined;
  if (Array.isArray(d)) return d;
  return d?.items ?? [];
}

function s(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toAlerts(violations: unknown, pending: unknown): AlertItem[] {
  const out: AlertItem[] = [];
  for (const v of rows(violations).slice(0, 5)) {
    out.push({
      id: `v-${s(v.id) ?? s(v.iurgId) ?? Math.random()}`,
      label: s(v.constraintRef) ?? s(v.constraint) ?? "Constraint violation",
      detail: s(v.reason) ?? "Hard constraint violated",
      tone: "danger",
      at: s(v.createdAt),
    });
  }
  for (const p of rows(pending).slice(0, 3)) {
    out.push({
      id: `p-${s(p.id) ?? Math.random()}`,
      label: "SECH gate pending",
      detail: s(p.currentGate) ?? s(p.finalDecision) ?? "Awaiting human approval",
      tone: "warning",
      at: s(p.createdAt),
    });
  }
  return out;
}

const TONE: Record<AlertItem["tone"], string> = {
  danger: "bg-[#ef4444]",
  warning: "bg-[#f59e0b]",
  info: "bg-[#3b82f6]",
};

export function RecentAlerts() {
  // Polling stands in for a WebSocket feed.
  // TODO(realtime): replace with a Socket.io subscription to
  // `constitutional.violations` + `sech.gateUpdates` once the gateway ships.
  const violations = useQuery({
    queryKey: ["alerts", "violations"],
    queryFn: () => api.iurg.violations({ pageSize: 5 }),
    refetchInterval: 10_000,
  });
  const pending = useQuery({
    queryKey: ["alerts", "pending"],
    queryFn: () => api.sech.pending({ pageSize: 3 }),
    refetchInterval: 10_000,
  });

  const alerts = toAlerts(violations.data, pending.data);
  const loading = violations.isLoading || pending.isLoading;

  return (
    <Card className="h-full">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">Recent Alerts</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#14b8a6]" /> live
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No active alerts. All gates clear.</p>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-md border border-slate-100 p-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[a.tone]}`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{a.label}</p>
                <p className="truncate text-xs text-slate-500">{a.detail}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
