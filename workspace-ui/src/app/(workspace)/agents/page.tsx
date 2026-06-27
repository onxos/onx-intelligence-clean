"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function AgentsPage() {
  return (
    <CrudDomainScreen
      title="Agents"
      description="Create, update, and manage agents with workspace-level controls."
      queryKey="agents"
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "description", label: "Description", inputType: "textarea" },
        { name: "status", label: "Status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] },
        { name: "model", label: "Model" },
        { name: "providerId", label: "Provider ID" },
      ]}
      columns={["id", "name", "status", "model", "providerId", "createdAt"]}
      filters={[{ name: "status", label: "Status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] }]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.agents(query) as Promise<any[]>}
      createFn={(payload) => api.workspace.createAgent(payload)}
      updateFn={(id, payload) => api.workspace.updateAgent(id, payload)}
      deleteFn={(id) => api.workspace.deleteAgent(id)}
    />
  );
}
