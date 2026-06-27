"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function EvidencePage() {
  return (
    <CrudDomainScreen
      title="Evidence"
      description="Track evidence records with confidence and outcome fields."
      queryKey="evidence"
      fields={[
        { name: "intent", label: "Intent", required: true },
        { name: "confidence", label: "Confidence", inputType: "number" },
        { name: "judgment", label: "Judgment", inputType: "textarea" },
        { name: "outcome", label: "Outcome", inputType: "textarea" },
        { name: "learning", label: "Learning", inputType: "textarea" },
      ]}
      columns={["id", "intent", "confidence", "outcome", "createdAt"]}
      defaultSortBy="createdAt"
      listFn={(query) => api.evidence.list(query) as Promise<any[]>}
      createFn={(payload) => api.evidence.create(payload)}
      updateFn={(id, payload) => api.evidence.update(id, payload)}
      deleteFn={(id) => api.evidence.remove(id)}
    />
  );
}
