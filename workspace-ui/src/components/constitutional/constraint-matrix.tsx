"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KIND_STYLES: Record<string, string> = {
  HC: "border-[#ef4444]/40 bg-[#fef2f2] text-[#991b1b]",
  SC: "border-[#3b82f6]/40 bg-[#eff6ff] text-[#1e40af]",
  AC: "border-[#14b8a6]/40 bg-[#f0fdfa] text-[#115e59]",
  DG: "border-[#f59e0b]/40 bg-[#fffbeb] text-[#92400e]",
  EB: "border-[#8b5cf6]/40 bg-[#f5f3ff] text-[#5b21b6]",
  OVR: "border-slate-300 bg-slate-50 text-slate-700",
  OR: "border-slate-300 bg-slate-50 text-slate-700",
};

type Row = Record<string, unknown>;

function normalizeConstraints(data: unknown): Array<{ id: string; kind: string; title?: string }> {
  const d = data as { constraints?: Row[]; items?: Row[] } | Row[] | undefined;
  const arr: Row[] = Array.isArray(d) ? d : (d?.constraints ?? d?.items ?? []);
  return arr
    .map((c) => {
      const id = String(c.id ?? c.constraintId ?? c.code ?? "");
      const kind = String(c.kind ?? c.family ?? id.split("-")[0] ?? "").toUpperCase();
      const title =
        typeof c.title === "string"
          ? c.title
          : typeof c.description === "string"
            ? c.description
            : undefined;
      return { id, kind, title };
    })
    .filter((c) => c.id);
}

export function ConstraintMatrix() {
  const constraints = useQuery({
    queryKey: ["sech", "constraints"],
    queryFn: () => api.sech.constraints(),
    staleTime: 60_000,
  });
  const items = normalizeConstraints(constraints.data);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">Constraint Matrix</CardTitle>
        <span className="text-xs text-slate-500">{items.length} constraints</span>
      </CardHeader>
      <CardContent>
        {constraints.isLoading ? (
          <p className="text-sm text-slate-500">Loading constraint registry…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Constraint registry unavailable.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
            {items.map((c) => (
              <div
                key={c.id}
                title={c.title ?? c.id}
                className={cn(
                  "truncate rounded-md border px-2 py-1.5 text-center font-mono text-xs",
                  KIND_STYLES[c.kind] ?? "border-slate-200 bg-white text-slate-600",
                )}
              >
                {c.id}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
