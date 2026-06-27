"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function WorkspaceHomePage() {
  return (
    <DomainScreen
      title="Workspace Home"
      description="Live workspace snapshot from production API."
      queryKey={["workspace-home"]}
      queryFn={api.workspace.home}
    />
  );
}
