"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function EvaluationsPage() {
  return (
    <CrudDomainScreen
      title="Evaluations"
      description="Evaluate provider performance with persisted ISES records."
      queryKey="evaluations"
      fields={[
        { name: "providerId", label: "Provider ID", required: true },
        { name: "intent", label: "Intent", required: true },
        { name: "context", label: "Context", inputType: "textarea" },
        { name: "iseScore", label: "ISE Score", inputType: "number" },
      ]}
      columns={["id", "intent", "iseScore", "provider", "createdAt"]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.evaluations(query) as Promise<any[]>}
      createFn={(payload) => api.workspace.createEvaluation(payload)}
      updateFn={(id, payload) => api.workspace.updateEvaluation(id, payload)}
      deleteFn={(id) => api.workspace.deleteEvaluation(id)}
    />
  );
}
