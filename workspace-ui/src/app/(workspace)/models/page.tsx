"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ModelsPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.models.title"
      descriptionKey="domains.models.description"
      queryKey="models"
      fields={[
        { name: "providerId", labelKey: "fields.providerId", required: true },
        { name: "model", labelKey: "fields.model", required: true },
      ]}
      columns={["id", "providerId", "providerName", "providerStatus", "model"]}
      defaultSortBy="providerName"
      listFn={(query) => api.workspace.models(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.workspace.createModel(payload)}
      updateFn={(id, payload) => api.workspace.updateModel(id, payload)}
      deleteFn={(id) => api.workspace.deleteModel(id)}
    />
  );
}
