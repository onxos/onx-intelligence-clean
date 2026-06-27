"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

type HomeData = {
  workspace?: {
    intelligenceCount?: number;
    evidenceCount?: number;
    providerCount?: number;
    toolCount?: number;
  };
  recentIntelligence?: unknown[];
  recentEvidence?: unknown[];
};

export default function WorkspaceHomePage() {
  const { t } = useI18n();
  const home = useQuery({ queryKey: ["workspace-home"], queryFn: api.workspace.home });

  if (home.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-slate-600">{t("workspace.loadingSnapshot")}</CardContent>
      </Card>
    );
  }

  if (home.error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-red-600">{(home.error as Error).message}</CardContent>
      </Card>
    );
  }

  const data = home.data as HomeData | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("workspace.homeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t("workspace.intelligence")}</p>
            <p className="text-xl font-semibold">{data?.workspace?.intelligenceCount ?? 0}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t("workspace.evidence")}</p>
            <p className="text-xl font-semibold">{data?.workspace?.evidenceCount ?? 0}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t("workspace.providers")}</p>
            <p className="text-xl font-semibold">{data?.workspace?.providerCount ?? 0}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t("workspace.tools")}</p>
            <p className="text-xl font-semibold">{data?.workspace?.toolCount ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("workspace.recentIntelligence")}</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(data?.recentIntelligence) && data.recentIntelligence.length > 0 ? (
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(data.recentIntelligence, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-600">{t("workspace.noIntelligence")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("workspace.recentEvidence")}</CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(data?.recentEvidence) && data.recentEvidence.length > 0 ? (
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(data.recentEvidence, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-600">{t("workspace.noEvidence")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
