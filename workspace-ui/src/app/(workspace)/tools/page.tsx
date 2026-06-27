"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function ToolsPage() {
  return (
    <DomainScreen
      title="Tools"
      description="Tool profiles from production tools endpoint."
      queryKey={["tools"]}
      queryFn={api.tools.list}
    />
  );
}
