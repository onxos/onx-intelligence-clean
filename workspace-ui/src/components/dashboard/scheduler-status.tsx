"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface JobStatus {
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastResult: string | null;
  runCount: number;
  errorCount: number;
}

interface SchedulerStatusResponse {
  isRunning: boolean;
  healthy: boolean;
  jobs: Record<string, JobStatus>;
}

const JOB_LABELS: Record<string, string> = {
  reinforcement: "Reinforcement (60s)",
  promotion: "Promotion checks (5m)",
  learningBatch: "Learning batch / decay (15m)",
  shadowEvaluation: "Shadow evaluation (30m)",
  capitalRecalculation: "Capital recalculation (60m)",
  measurement: "Measurement / IRS (60m)",
  healthCheck: "Health check (30s)",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function SchedulerStatus() {
  const status = useQuery({
    queryKey: ["scheduler", "status"],
    queryFn: () => api.intelligence.schedulerStatus() as Promise<SchedulerStatusResponse>,
    refetchInterval: 15_000,
  });

  const jobs = status.data?.jobs ?? {};
  const jobEntries = Object.entries(jobs);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Autonomous Scheduler</CardTitle>
        <Badge
          className={cn(
            status.data?.healthy
              ? "bg-[#dcfce7] text-[#16a34a]"
              : "bg-[#fee2e2] text-[#ef4444]",
          )}
        >
          {status.isLoading ? "…" : status.data?.healthy ? "HEALTHY" : "DEGRADED"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobEntries.length === 0 && !status.isLoading ? (
          <p className="text-sm text-slate-500">No job telemetry yet.</p>
        ) : null}
        {jobEntries.map(([key, job]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-slate-900">{JOB_LABELS[key] ?? key}</p>
              <p className="text-xs text-slate-500">
                {job.lastResult ?? "not yet run"} · last run {relativeTime(job.lastRunAt)}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>{job.runCount} runs</p>
              {job.errorCount > 0 ? (
                <p className="text-[#ef4444]">{job.errorCount} errors</p>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
