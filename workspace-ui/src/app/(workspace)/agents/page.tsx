"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function AgentsPage() {
  return (
    <DomainScreen
      title="Agents"
      description="Agents domain from backend endpoint."
      queryKey={["agents"]}
      queryFn={api.workspace.agents}
    />
  );
}
