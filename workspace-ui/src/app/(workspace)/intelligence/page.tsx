"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export default function IntelligencePage() {
  const { t } = useI18n();
  const statsQuery = useQuery({ queryKey: ["intelligence-stats"], queryFn: api.intelligence.stats });

  if (statsQuery.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">{t("domains.intelligence.loading")}</CardContent></Card>;
  }

  if (statsQuery.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(statsQuery.error as Error).message}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("domains.intelligence.stats")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(statsQuery.data, null, 2)}</pre>
        </CardContent>
      </Card>
      <CrudDomainScreen
        titleKey="domains.intelligence.title"
        descriptionKey="domains.intelligence.description"
        queryKey="intelligence"
        fields={[
          { name: "name", labelKey: "fields.name", required: true },
          { name: "content", labelKey: "fields.content", required: true, inputType: "textarea" },
          {
            name: "objectType",
            labelKey: "fields.objectType",
            options: ["SIGNAL", "PATTERN", "JUDGMENT", "UNDERSTANDING", "WISDOM", "EXTERNAL_INTELLIGENCE"],
          },
          { name: "semanticSummary", labelKey: "fields.semanticSummary", inputType: "textarea" },
          { name: "privacyLevel", labelKey: "fields.privacyLevel", options: ["PUBLIC", "INSTITUTIONAL", "CONFIDENTIAL", "RESTRICTED"] },
          { name: "confidenceScore", labelKey: "fields.confidenceScore", inputType: "number" },
          { name: "trustScore", labelKey: "fields.trustScore", inputType: "number" },
        ]}
        columns={["id", "name", "objectType", "state", "confidenceScore", "createdAt"]}
        filters={[
          {
            name: "type",
            labelKey: "fields.objectType",
            options: ["SIGNAL", "PATTERN", "JUDGMENT", "UNDERSTANDING", "WISDOM", "EXTERNAL_INTELLIGENCE"],
          },
        ]}
        defaultSortBy="createdAt"
        listFn={(query) => api.intelligence.list(query) as Promise<Record<string, unknown>[]>}
        createFn={(payload) => api.intelligence.create(payload)}
        updateFn={(id, payload) => api.intelligence.update(id, payload)}
        deleteFn={(id) => api.intelligence.remove(id)}
      />
    </div>
  );
}
