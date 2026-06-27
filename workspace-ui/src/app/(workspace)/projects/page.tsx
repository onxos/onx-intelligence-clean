"use client";

import { CrudDomainScreen } from "@/components/crud-domain-screen";
import { api } from "@/lib/api/client";

export default function ProjectsPage() {
  return (
    <CrudDomainScreen
      title="Projects"
      description="Manage projects with production CRUD, filtering, sorting, and pagination."
      queryKey="projects"
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "description", label: "Description", inputType: "textarea" },
        { name: "status", label: "Status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] },
      ]}
      columns={["id", "name", "status", "description", "createdAt"]}
      filters={[{ name: "status", label: "Status", options: ["ACTIVE", "ARCHIVED", "DISABLED"] }]}
      defaultSortBy="createdAt"
      listFn={(query) => api.workspace.projects(query) as Promise<any[]>}
      createFn={(payload) => api.workspace.createProject(payload)}
      updateFn={(id, payload) => api.workspace.updateProject(id, payload)}
      deleteFn={(id) => api.workspace.deleteProject(id)}
    />
  );
}
