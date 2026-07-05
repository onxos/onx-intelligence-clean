"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GovernanceEvent {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

interface GovernanceLogResponse {
  total: number;
  events: GovernanceEvent[];
}

function toneFor(action: string): string {
  if (action.includes("REJECT") || action.includes("BLOCK")) return "bg-[#fee2e2] text-[#ef4444]";
  if (action.includes("DECAY") || action.includes("SHADOW")) return "bg-[#fef3c7] text-[#b45309]";
  return "bg-[#dcfce7] text-[#16a34a]";
}

export function GovernanceLog() {
  const query = useQuery({
    queryKey: ["intelligence", "governance-log"],
    queryFn: () => api.intelligence.governanceLog({ limit: 20 }) as Promise<GovernanceLogResponse>,
    refetchInterval: 20_000,
  });

  const events = query.data?.events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Governance Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">
            {query.isLoading ? "Loading…" : "No autonomous decisions recorded yet."}
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Badge className={cn(toneFor(event.action))}>{event.action}</Badge>
                  <span className="text-xs text-slate-500">{event.resource}</span>
                </div>
                {event.oldValue || event.newValue ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {event.oldValue ?? "—"} → {event.newValue ?? "—"}
                  </p>
                ) : null}
              </div>
              <span className="whitespace-nowrap text-xs text-slate-400">
                {new Date(event.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
