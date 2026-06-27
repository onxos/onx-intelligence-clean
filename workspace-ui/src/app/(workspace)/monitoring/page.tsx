"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonitoringPage() {
  const monitoring = useQuery({ queryKey: ["monitoring"], queryFn: api.workspace.monitoring });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health.check });

  if (monitoring.isLoading || health.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">Loading monitoring snapshot...</CardContent></Card>;
  }

  if (monitoring.error || health.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(monitoring.error || health.error as Error)?.message}</CardContent></Card>;
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
    </div>
  );
}
