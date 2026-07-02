import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TIER_STYLES: Record<string, { label: string; className: string; dot: string }> = {
  proven: { label: "Proven", className: "bg-[#dcfce7] text-[#166534]", dot: "bg-[#16a34a]" },
  probable: { label: "Probable", className: "bg-[#dbeafe] text-[#1e40af]", dot: "bg-[#3b82f6]" },
  speculative: { label: "Speculative", className: "bg-[#fef3c7] text-[#92400e]", dot: "bg-[#f59e0b]" },
  unverified: { label: "Unverified", className: "bg-[#fee2e2] text-[#991b1b]", dot: "bg-[#ef4444]" },
};

/** Map a numeric AC-05 evidence tier (1..4) to a reality tier label. */
export function evidenceTierToReality(tier?: string): keyof typeof TIER_STYLES {
  switch (String(tier)) {
    case "1":
      return "proven";
    case "2":
      return "probable";
    case "3":
      return "speculative";
    default:
      return "unverified";
  }
}

export function TierBadge({ tier, children }: { tier: string; children?: ReactNode }) {
  const key = (TIER_STYLES[tier] ? tier : evidenceTierToReality(tier)) as keyof typeof TIER_STYLES;
  const style = TIER_STYLES[key] ?? TIER_STYLES.unverified;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        style.className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {children ?? style.label}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-[#dcfce7] text-[#166534]",
  COMPLETED: "bg-[#dcfce7] text-[#166534]",
  OVERRIDE: "bg-[#dbeafe] text-[#1e40af]",
  CONFLICT: "bg-[#fef3c7] text-[#92400e]",
  REJECTED: "bg-[#fee2e2] text-[#991b1b]",
  FAILED: "bg-[#fee2e2] text-[#991b1b]",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status?.toUpperCase?.() ?? ""] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", cls)}>
      {status}
    </span>
  );
}
