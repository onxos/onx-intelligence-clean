"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function AgentsPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.agents.title"
      descriptionKey="domains.agents.description"
      queryKey="agents"
      fields={[
        { name: "name", labelKey: "fields.name", required: true },
        { name: "description", labelKey: "fields.description", inputType: "textarea" },
        { name: "status", labelKey: "fields.status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] },
        { name: "model", labelKey: "fields.model" },
        { name: "providerId", labelKey: "fields.providerId" },
      ]}
      columns={["id", "name", "status", "model", "providerId", "createdAt"]}
      filters={[{ name: "status", labelKey: "fields.status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] }]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.agents(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.workspace.createAgent(payload)}
      updateFn={(id, payload) => api.workspace.updateAgent(id, payload)}
      deleteFn={(id) => api.workspace.deleteAgent(id)}
    />
  );
}
