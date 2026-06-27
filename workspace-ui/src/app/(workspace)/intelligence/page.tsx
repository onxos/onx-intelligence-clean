"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IntelligencePage() {
  const statsQuery = useQuery({ queryKey: ["intelligence-stats"], queryFn: api.intelligence.stats });

  if (statsQuery.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">Loading intelligence session...</CardContent></Card>;
  }

  if (statsQuery.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(statsQuery.error as Error).message}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Intelligence Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(statsQuery.data, null, 2)}</pre>
        </CardContent>
      </Card>
      <CrudDomainScreen
        title="Intelligence Objects"
        description="Capture and evolve intelligence objects with ownership and confidence metadata."
        queryKey="intelligence"
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "content", label: "Content", required: true, inputType: "textarea" },
          {
            name: "objectType",
            label: "Object Type",
            options: ["SIGNAL", "PATTERN", "JUDGMENT", "UNDERSTANDING", "WISDOM", "EXTERNAL_INTELLIGENCE"],
          },
          { name: "semanticSummary", label: "Semantic Summary", inputType: "textarea" },
          { name: "privacyLevel", label: "Privacy", options: ["PUBLIC", "INSTITUTIONAL", "PRIVATE"] },
          { name: "confidenceScore", label: "Confidence", inputType: "number" },
          { name: "trustScore", label: "Trust", inputType: "number" },
        ]}
        columns={["id", "name", "objectType", "state", "confidenceScore", "createdAt"]}
        filters={[
          {
            name: "type",
            label: "Type",
            options: ["SIGNAL", "PATTERN", "JUDGMENT", "UNDERSTANDING", "WISDOM", "EXTERNAL_INTELLIGENCE"],
          },
        ]}
        defaultSortBy="createdAt"
        listFn={(query) => api.intelligence.list(query) as Promise<any[]>}
        createFn={(payload) => api.intelligence.create(payload)}
        updateFn={(id, payload) => api.intelligence.update(id, payload)}
        deleteFn={(id) => api.intelligence.remove(id)}
      />
    </div>
  );
}
