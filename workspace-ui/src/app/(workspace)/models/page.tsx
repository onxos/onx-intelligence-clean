"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ModelsPage() {
  return (
    <CrudDomainScreen
      title="Models"
      description="Maintain provider model inventory with live persistence in provider profiles."
      queryKey="models"
      fields={[
        { name: "providerId", label: "Provider ID", required: true },
        { name: "model", label: "Model", required: true },
      ]}
      columns={["id", "providerId", "providerName", "providerStatus", "model"]}
      defaultSortBy="providerName"
      listFn={(query) => api.workspace.models(query) as Promise<any[]>}
      createFn={(payload) => api.workspace.createModel(payload)}
      updateFn={(id, payload) => api.workspace.updateModel(id, payload)}
      deleteFn={(id) => api.workspace.deleteModel(id)}
    />
  );
}
