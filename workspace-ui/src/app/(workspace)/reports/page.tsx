"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

function renderRows(items: Array<Record<string, unknown>>, noRecordsText: string) {
  if (!items.length) {
    return <p className="text-sm text-slate-600">{noRecordsText}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={String(item.id || `${item.type || "record"}-${item.createdAt || ""}`)}>
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
  const { t } = useI18n();
  const snapshot = useQuery({ queryKey: ["reports"], queryFn: api.workspace.reports });
  const governance = useQuery({
    queryKey: ["report-governance"],
    queryFn: () => api.workspace.reportGovernance({ page: 1, pageSize: 20 }),
  });
  const capital = useQuery({
    queryKey: ["report-capital"],
    queryFn: () => api.workspace.reportCapital({ page: 1, pageSize: 20 }),
  });
  const capitalSummary = useQuery({
    queryKey: ["capital-reports"],
    queryFn: () => api.capital.reports(),
  });

  if (snapshot.isLoading || governance.isLoading || capital.isLoading || capitalSummary.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">{t("domains.reports.loading")}</CardContent>
      </Card>
    );
  }

  if (snapshot.error || governance.error || capital.error || capitalSummary.error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-red-600">
          {(snapshot.error || governance.error || capital.error || capitalSummary.error as Error)?.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("domains.reports.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(snapshot.data, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("domains.reports.governance")}</CardTitle>
        </CardHeader>
        <CardContent>
          {renderRows(
            (governance.data as Array<Record<string, unknown>>) || [],
            t("common.noRecords"),
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("domains.reports.capital")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="mb-4 whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(capitalSummary.data, null, 2)}
          </pre>
          {renderRows(
            (capital.data as Array<Record<string, unknown>>) || [],
            t("common.noRecords"),
          )}
        </CardContent>
      </Card>
    </div>
  );
}
