"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/tier-badge";

const GATES = [
  { key: "pre_judgment", label: "Pre-Judgment" },
  { key: "pre_decision", label: "Pre-Decision" },
  { key: "pre_execution", label: "Pre-Execution" },
  { key: "post_outcome", label: "Post-Outcome" },
];

type Row = Record<string, unknown>;

function normalizeGates(data: unknown): Record<string, Row> {
  const d = data as { gates?: Row[]; items?: Row[] } | Row[] | undefined;
  const arr: Row[] = Array.isArray(d) ? d : (d?.gates ?? d?.items ?? []);
  const map: Record<string, Row> = {};
  for (const g of arr) {
    const key = String(g.checkType ?? g.gate ?? "").toLowerCase();
    if (key) map[key] = g;
  }
  return map;
}

export function SechMonitor() {
  const gates = useQuery({
    queryKey: ["sech", "gates"],
    queryFn: () => api.sech.gates(),
    refetchInterval: 15_000,
  });
  const map = normalizeGates(gates.data);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {GATES.map((g) => {
        const info = map[g.key];
        const last = (info?.lastRoute ?? info?.last) as Row | undefined;
        const status = (last?.status as string) ?? (info ? "READY" : "IDLE");
        return (
          <Card key={g.key}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{g.label}</p>
              <div className="mt-2 flex items-center justify-between">
                <StatusBadge status={status} />
                <span className="text-lg" aria-hidden>
                  {status === "REJECTED" || status === "FAILED"
                    ? "🔴"
                    : status === "CONFLICT"
                      ? "⚠️"
                      : "✅"}
                </span>
              </div>
              <p className="mt-2 font-mono text-xs text-slate-400">{g.key}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
