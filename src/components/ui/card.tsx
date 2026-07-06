import type { HTMLAttributes, PropsWithChildren } from "react";

export function Card({ className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div className={`rounded-2xl border border-amber-100 bg-white/85 shadow-sm ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div className={`border-b border-amber-100 px-4 py-3 ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div className={`px-4 py-3 ${className}`} {...props} />;
}
