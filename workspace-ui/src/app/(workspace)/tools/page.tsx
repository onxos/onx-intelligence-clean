"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ToolsPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.tools.title"
      descriptionKey="domains.tools.description"
      queryKey="tools"
      fields={[
        { name: "toolId", labelKey: "fields.toolId", required: true },
        { name: "toolName", labelKey: "fields.toolName", required: true },
        { name: "category", labelKey: "fields.category", options: ["ANALYTICS", "AUTOMATION", "SEARCH", "KNOWLEDGE"] },
        { name: "status", labelKey: "fields.status", options: ["ACTIVE", "INACTIVE", "EXPERIMENTAL"] },
        { name: "capabilities", labelKey: "fields.capabilities" },
        { name: "costPerCall", labelKey: "fields.costPerCall", inputType: "number" },
        { name: "totalCapital", labelKey: "fields.totalCapital", inputType: "number" },
      ]}
      columns={["id", "toolId", "toolName", "category", "status", "costPerCall"]}
      filters={[
        { name: "status", labelKey: "fields.status", options: ["ACTIVE", "INACTIVE", "EXPERIMENTAL"] },
        { name: "category", labelKey: "fields.category", options: ["ANALYTICS", "AUTOMATION", "SEARCH", "KNOWLEDGE"] },
      ]}
      defaultSortBy="createdAt"
      listFn={(query) => api.tools.list(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.tools.create(payload)}
      updateFn={(id, payload) => api.tools.update(id, payload)}
      deleteFn={(id) => api.tools.remove(id)}
    />
  );
}
