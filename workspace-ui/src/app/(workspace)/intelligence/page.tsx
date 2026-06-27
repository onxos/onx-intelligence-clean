"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IntelligencePage() {
  const listQuery = useQuery({ queryKey: ["intelligence-list"], queryFn: api.intelligence.list });
  const statsQuery = useQuery({ queryKey: ["intelligence-stats"], queryFn: api.intelligence.stats });

  if (listQuery.isLoading || statsQuery.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">Loading intelligence session...</CardContent></Card>;
  }

  if (listQuery.error || statsQuery.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(listQuery.error || statsQuery.error as Error)?.message}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Intelligence Session</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(statsQuery.data, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Intelligence Objects</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(listQuery.data, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
