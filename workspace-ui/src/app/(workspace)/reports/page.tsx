"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function renderRows(items: any[]) {
  if (!items.length) {
    return <p className="text-sm text-slate-600">No records available.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="grid gap-2 py-3 text-sm md:grid-cols-2">
            {Object.entries(item)
              .slice(0, 8)
              .map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{key}</p>
                  <p className="break-all text-slate-900">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </p>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const snapshot = useQuery({ queryKey: ["reports"], queryFn: api.workspace.reports });
  const governance = useQuery({
    queryKey: ["report-governance"],
    queryFn: () => api.workspace.reportGovernance({ page: 1, pageSize: 20 }),
  });
  const capital = useQuery({
    queryKey: ["report-capital"],
    queryFn: () => api.workspace.reportCapital({ page: 1, pageSize: 20 }),
  });

  if (snapshot.isLoading || governance.isLoading || capital.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">Loading reports...</CardContent>
      </Card>
    );
  }

  if (snapshot.error || governance.error || capital.error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-red-600">
          {(snapshot.error || governance.error || capital.error as Error)?.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Reports Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(snapshot.data, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Governance Records</CardTitle>
        </CardHeader>
        <CardContent>{renderRows((governance.data as any[]) || [])}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capital Records</CardTitle>
        </CardHeader>
        <CardContent>{renderRows((capital.data as any[]) || [])}</CardContent>
      </Card>
    </div>
  );
}
