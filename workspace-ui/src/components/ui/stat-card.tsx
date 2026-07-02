import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  tone?: "up" | "down" | "alert" | "neutral";
  hint?: ReactNode;
}) {
  const deltaTone =
    tone === "up"
      ? "text-[#16a34a]"
      : tone === "down"
        ? "text-[#ef4444]"
        : tone === "alert"
          ? "text-[#f59e0b]"
          : "text-slate-500";
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 font-mono text-2xl font-semibold text-slate-900">{value}</p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {delta ? <span className={cn("font-semibold", deltaTone)}>{delta}</span> : null}
          {hint ? <span className="text-slate-500">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
