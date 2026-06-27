"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ToolsPage() {
  return (
    <CrudDomainScreen
      title="Tools"
      description="Manage tools with category/status, capabilities, and cost controls."
      queryKey="tools"
      fields={[
        { name: "toolId", label: "Tool ID", required: true },
        { name: "toolName", label: "Tool Name", required: true },
        { name: "category", label: "Category", options: ["ANALYTICS", "AUTOMATION", "DATA", "SECURITY"] },
        { name: "status", label: "Status", options: ["ACTIVE", "INACTIVE", "DEPRECATED"] },
        { name: "capabilities", label: "Capabilities (comma separated)" },
        { name: "costPerCall", label: "Cost Per Call", inputType: "number" },
        { name: "totalCapital", label: "Total Capital", inputType: "number" },
      ]}
      columns={["id", "toolId", "toolName", "category", "status", "costPerCall"]}
      filters={[
        { name: "status", label: "Status", options: ["ACTIVE", "INACTIVE", "DEPRECATED"] },
        { name: "category", label: "Category", options: ["ANALYTICS", "AUTOMATION", "DATA", "SECURITY"] },
      ]}
      defaultSortBy="createdAt"
      listFn={(query) => api.tools.list(query) as Promise<any[]>}
      createFn={(payload) => api.tools.create(payload)}
      updateFn={(id, payload) => api.tools.update(id, payload)}
      deleteFn={(id) => api.tools.remove(id)}
    />
  );
}
