import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500 transition focus:ring-2"
    />
  );
}
