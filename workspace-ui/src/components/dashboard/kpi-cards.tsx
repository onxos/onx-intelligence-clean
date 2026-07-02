"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { StatCard } from "@/components/ui/stat-card";

function count(data: unknown): number {
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  const obj = data as { total?: number; items?: unknown[] };
  if (typeof obj.total === "number") return obj.total;
  if (Array.isArray(obj.items)) return obj.items.length;
  return 0;
}

export function KpiCards() {
  const queries = useQuery({
    queryKey: ["kpi", "ai-logs"],
    queryFn: () => api.ai.logs({ pageSize: 1 }),
    refetchInterval: 20_000,
  });
  const violations = useQuery({
    queryKey: ["kpi", "violations"],
    queryFn: () => api.iurg.violations({ pageSize: 1 }),
    refetchInterval: 15_000,
  });

  // TODO(clinical): wire to a real /patients endpoint when the clinical
  // service ships; mocked for now.
  const patientsToday = 89;
  const revenue = "$12.4K";

  const queryCount = count(queries.data);
  const violationCount = count(violations.data);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="AI Queries"
        value={queries.isLoading ? "…" : queryCount.toLocaleString()}
        delta="↑ 12%"
        tone="up"
        hint="vs. last week"
      />
      <StatCard
        label="Active Violations"
        value={violations.isLoading ? "…" : violationCount.toLocaleString()}
        delta={violationCount > 0 ? "needs review" : "clear"}
        tone={violationCount > 0 ? "alert" : "up"}
        hint="IURG bound"
      />
      <StatCard label="Patients Today" value={patientsToday} delta="↑ 5%" tone="up" hint="mock" />
      <StatCard label="Revenue" value={revenue} delta="↑ 8%" tone="up" hint="mock" />
    </div>
  );
}
