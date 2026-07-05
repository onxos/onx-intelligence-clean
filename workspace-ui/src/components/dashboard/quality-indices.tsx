"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QualityIndicesResponse {
  objectCount: number;
  avgAmanah: number;
  avgConfidence: number;
  avgTrust: number;
  avgQuality: number;
  ici: number;
  irs: number;
  progressState: "ACCUMULATING" | "STABILIZING" | "DECLINING";
  byType: Record<string, number>;
}

const PROGRESS_TONE: Record<QualityIndicesResponse["progressState"], string> = {
  ACCUMULATING: "bg-[#dcfce7] text-[#16a34a]",
  STABILIZING: "bg-[#fef3c7] text-[#b45309]",
  DECLINING: "bg-[#fee2e2] text-[#ef4444]",
};

function Gauge({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-900"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function QualityIndices() {
  const query = useQuery({
    queryKey: ["intelligence", "quality-indices"],
    queryFn: () => api.intelligence.qualityIndices() as Promise<QualityIndicesResponse>,
    refetchInterval: 30_000,
  });

  const data = query.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Quality Indices</CardTitle>
        {data ? (
          <Badge className={cn(PROGRESS_TONE[data.progressState])}>{data.progressState}</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!data ? (
          <p className="text-sm text-slate-500">{query.isLoading ? "Loading…" : "No data yet."}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Gauge label="ICI (Capital Index)" value={data.ici} />
              <Gauge label="IRS (Risk Score)" value={data.irs} />
              <Gauge label="Avg Amanah" value={data.avgAmanah} />
              <Gauge label="Avg Confidence" value={data.avgConfidence} />
            </div>
            <p className="text-xs text-slate-500">
              {data.objectCount} intelligence object(s) across {Object.keys(data.byType).length} type(s)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
