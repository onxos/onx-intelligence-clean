"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function EvidencePage() {
  return (
    <CrudDomainScreen
      titleKey="domains.evidence.title"
      descriptionKey="domains.evidence.description"
      queryKey="evidence"
      fields={[
        { name: "intent", labelKey: "fields.intent", required: true },
        { name: "confidence", labelKey: "fields.confidence", inputType: "number" },
        { name: "judgment", labelKey: "fields.judgment", inputType: "textarea" },
        { name: "outcome", labelKey: "fields.outcome", inputType: "textarea" },
        { name: "learning", labelKey: "fields.learning", inputType: "textarea" },
      ]}
      columns={["id", "intent", "confidence", "outcome", "createdAt"]}
      defaultSortBy="createdAt"
      listFn={(query) => api.evidence.list(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.evidence.create(payload)}
      updateFn={(id, payload) => api.evidence.update(id, payload)}
      deleteFn={(id) => api.evidence.remove(id)}
    />
  );
}
