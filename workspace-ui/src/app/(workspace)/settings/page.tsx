"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { rememberLanguage } from "@/lib/workspace-memory";

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.workspace.settings });
  const me = useQuery({ queryKey: ["me"], queryFn: api.auth.me });
  const [name, setName] = useState("");
  const [status, setStatus] = useState("ACTIVE");

  const user = (settings.data as { user?: { name?: string; status?: string } } | undefined)?.user;
  const currentName = name || user?.name || "";
  const currentStatus = status === "ACTIVE" && user?.status ? user.status : status;

  const saveMutation = useMutation({
    mutationFn: () => api.workspace.updateSettings({ name: currentName, status: currentStatus }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (settings.isLoading || me.isLoading) {
    return <Card><CardContent className="py-8 text-sm text-slate-600">{t("domains.settings.loading")}</CardContent></Card>;
  }

  if (settings.error || me.error) {
    return <Card><CardContent className="py-8 text-sm text-red-600">{(settings.error || me.error as Error)?.message}</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("domains.settings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t("domains.settings.displayName")}</p>
            <Input value={currentName} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t("domains.settings.status")}</p>
            <select
              value={currentStatus}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="ACTIVE">{t("enum.ACTIVE")}</option>
              <option value="INACTIVE">{t("enum.INACTIVE")}</option>
              <option value="SUSPENDED">{t("enum.SUSPENDED")}</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t("common.language")}</p>
            <select
              value={locale}
              onChange={(e) => {
                const next = e.target.value as "en" | "ar";
                setLocale(next);
                rememberLanguage(next);
              }}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t("common.saving") : t("common.saveSettings")}
          </Button>
          {saveMutation.error ? (
            <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("common.authenticatedUser")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(me.data, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
