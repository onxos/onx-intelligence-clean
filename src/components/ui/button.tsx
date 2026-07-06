import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "ghost";

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: Variant;
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200";
  const palette =
    variant === "primary"
      ? "bg-amber-700 text-white hover:bg-amber-800"
      : "bg-white/70 text-gray-700 hover:bg-white border border-amber-200";
  return <button className={`${base} ${palette} ${className}`} {...props} />;
}
