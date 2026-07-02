"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTIONS = [
  { label: "New AI Query", href: "/ai", emoji: "🧠" },
  { label: "Constitutional Monitor", href: "/constitutional", emoji: "⚖️" },
  { label: "Clinical Support", href: "/clinical", emoji: "🏥" },
  { label: "View Reports", href: "/reports", emoji: "📋" },
];

export function QuickActions() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col gap-1 rounded-md border border-slate-200 p-3 text-sm transition-colors hover:border-[#14b8a6] hover:bg-[#f0fdfa]"
          >
            <span className="text-lg">{a.emoji}</span>
            <span className="font-medium text-slate-800">{a.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
