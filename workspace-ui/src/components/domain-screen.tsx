"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingState } from "@/components/pending-state";
import { Badge } from "@/components/ui/badge";

type PendingResponse = {
  pending?: boolean;
  message?: string;
  items?: unknown[];
};

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function DomainScreen({
  title,
  description,
  queryKey,
  queryFn,
}: {
  title: string;
  description: string;
  queryKey: string[];
  queryFn: () => Promise<unknown>;
}) {
  const { data, isLoading, error } = useQuery({ queryKey, queryFn });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">Loading {title}...</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const pendingData = data as PendingResponse | undefined;

  if (pendingData?.pending) {
    return <PendingState message={pendingData.message ?? `${title} endpoint is pending.`} />;
  }

  const items = Array.isArray(data) ? data : pendingData?.items;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title}</span>
            <Badge>{Array.isArray(items) ? `${items.length} records` : "Live"}</Badge>
          </CardTitle>
          <p className="text-sm text-slate-600">{description}</p>
        </CardHeader>
      </Card>

      {Array.isArray(items) ? (
        items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-slate-600">No records available.</CardContent>
          </Card>
        ) : (
          items.map((item, idx) => (
            <Card key={idx}>
              <CardContent className="grid gap-2 py-4 md:grid-cols-2">
                {Object.entries(item).slice(0, 8).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{key}</p>
                    <p className="text-sm text-slate-900 break-all">{formatValue(value)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )
      ) : (
        <Card>
          <CardContent className="py-4">
            <pre className="text-xs whitespace-pre-wrap break-all text-slate-800">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
