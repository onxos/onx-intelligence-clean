"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonitoringPage() {
  const monitoring = useQuery({ queryKey: ["monitoring"], queryFn: api.workspace.monitoring });
  const audit = useQuery({
    queryKey: ["monitoring-audit"],
    queryFn: () => api.workspace.monitoringAudit({ page: 1, pageSize: 20 }),
  });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health.check });

  if (monitoring.isLoading || audit.isLoading || health.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">Loading monitoring snapshot...</CardContent></Card>;
  }

  if (monitoring.error || audit.error || health.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(monitoring.error || audit.error || health.error as Error)?.message}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Monitoring</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(monitoring.data, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Health Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(health.data, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monitoring Audit Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(audit.data) && audit.data.length > 0 ? (
            <div className="space-y-2">
              {(audit.data as any[]).map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.action}</p>
                  <p className="text-sm text-slate-800">{item.resource}</p>
                  <p className="text-xs text-slate-500">actor: {item.actorId}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No audit entries available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
