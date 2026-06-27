"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { rememberAsset, rememberProject } from "@/lib/workspace-memory";
import { useEffect } from "react";

export function ProjectDetailsClient({ id }: { id: string }) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["project-details", id],
    queryFn: () => api.workspace.projectDetails(id),
  });

  useEffect(() => {
    rememberProject(id);
    rememberAsset({ id, domain: "projects", label: id });
  }, [id]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">{t("domains.projectDetails.loading")}</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-red-600">{(error as Error).message}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("domains.projectDetails.title", undefined, { id })}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </CardContent>
    </Card>
  );
}
