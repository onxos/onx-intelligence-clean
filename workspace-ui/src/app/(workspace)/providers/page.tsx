"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function ProvidersPage() {
  return (
    <DomainScreen
      title="Providers"
      description="Provider profiles from production providers endpoint."
      queryKey={["providers"]}
      queryFn={api.providers.list}
    />
  );
}
