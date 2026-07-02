"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiProviderInfo } from "@/types/onx";

export function ProviderStatus() {
  const providers = useQuery({
    queryKey: ["ai", "providers"],
    queryFn: () => api.ai.providers() as Promise<AiProviderInfo[]>,
    refetchInterval: 30_000,
  });

  const list = Array.isArray(providers.data) ? providers.data : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Provider Status</CardTitle>
      </CardHeader>
      <CardContent>
        {providers.isLoading ? (
          <p className="text-sm text-slate-500">Loading providers…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    p.mode === "live" ? "bg-[#22c55e]" : "bg-[#f59e0b]"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize text-slate-800">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.mode === "live" ? "live" : "mock"} · tier {p.evidenceTier}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
