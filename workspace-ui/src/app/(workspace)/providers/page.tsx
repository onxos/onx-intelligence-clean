"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ProvidersPage() {
  return (
    <CrudDomainScreen
      title="Providers"
      description="Manage provider profiles and scoring inputs in production."
      queryKey="providers"
      fields={[
        { name: "providerId", label: "Provider ID", required: true },
        { name: "providerName", label: "Provider Name", required: true },
        { name: "status", label: "Status", options: ["ACTIVE", "PAUSED", "DEPRECATED"] },
        { name: "priority", label: "Priority", inputType: "number" },
        { name: "models", label: "Models (comma separated)" },
        { name: "iseScore", label: "ISE Score", inputType: "number" },
      ]}
      columns={["id", "providerId", "providerName", "status", "priority", "iseScore"]}
      filters={[
        { name: "status", label: "Status", options: ["ACTIVE", "PAUSED", "DEPRECATED"] },
      ]}
      defaultSortBy="priority"
      defaultSortOrder="asc"
      listFn={(query) => api.providers.list(query) as Promise<any[]>}
      createFn={(payload) => api.providers.create(payload)}
      updateFn={(id, payload) => api.providers.update(id, payload)}
      deleteFn={(id) => api.providers.remove(id)}
    />
  );
}
