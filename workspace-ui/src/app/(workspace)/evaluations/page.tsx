"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function EvaluationsPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.evaluations.title"
      descriptionKey="domains.evaluations.description"
      queryKey="evaluations"
      fields={[
        { name: "providerId", labelKey: "fields.providerId", required: true },
        { name: "intent", labelKey: "fields.intent", required: true },
        { name: "context", labelKey: "fields.context", inputType: "textarea" },
        { name: "iseScore", labelKey: "fields.iseScore", inputType: "number" },
      ]}
      columns={["id", "intent", "iseScore", "provider", "createdAt"]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.evaluations(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.workspace.createEvaluation(payload)}
      updateFn={(id, payload) => api.workspace.updateEvaluation(id, payload)}
      deleteFn={(id) => api.workspace.deleteEvaluation(id)}
    />
  );
}
