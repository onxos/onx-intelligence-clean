"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ProjectsPage() {
  return (
    <CrudDomainScreen
      titleKey="domains.projects.title"
      descriptionKey="domains.projects.description"
      queryKey="projects"
      fields={[
        { name: "name", labelKey: "fields.name", required: true },
        { name: "description", labelKey: "fields.description", inputType: "textarea" },
        { name: "status", labelKey: "fields.status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] },
      ]}
      columns={["id", "name", "status", "description", "createdAt"]}
      filters={[{ name: "status", labelKey: "fields.status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] }]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.projects(query) as Promise<Record<string, unknown>[]>}
      createFn={(payload) => api.workspace.createProject(payload)}
      updateFn={(id, payload) => api.workspace.updateProject(id, payload)}
      deleteFn={(id) => api.workspace.deleteProject(id)}
    />
  );
}
