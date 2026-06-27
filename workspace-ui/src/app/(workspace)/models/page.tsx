"use client";

import { DomainScreen } from "@/components/domain-screen";
import { api } from "@/lib/api/client";

export default function ModelsPage() {
  return (
    <DomainScreen
      title="Models"
      description="Model inventory aggregated from provider profiles."
      queryKey={["models"]}
      queryFn={api.workspace.models}
    />
  );
}
