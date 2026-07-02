"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Edge {
  fromNodeType?: string;
  fromNodeRef?: string;
  fromNodeId?: string;
  toNodeType?: string;
  toNodeRef?: string;
  toNodeId?: string;
  edgeType?: string;
}

const COLUMN_FOR: Record<string, number> = {
  INTENT: 0,
  CONSTRAINT: 1,
  ENFORCEMENT: 2,
  VIOLATION: 2,
  DECISION: 2,
  EVIDENCE: 2,
  OVERRIDE: 2,
  CONFLICT: 2,
};

const COLUMN_COLOR = ["#14b8a6", "#3b82f6", "#f59e0b"];

function columnFor(type?: string): number {
  return COLUMN_FOR[(type ?? "").toUpperCase()] ?? 2;
}

export function IurgGraph() {
  const edges = useQuery({
    queryKey: ["iurg", "edges"],
    queryFn: () => api.iurg.edges({ pageSize: 20 }),
    refetchInterval: 20_000,
  });

  const raw: Edge[] =
    (edges.data as { items?: Edge[] })?.items ?? (Array.isArray(edges.data) ? (edges.data as Edge[]) : []);
  const list = raw.slice(0, 14);

  const width = 720;
  const height = 300;
  const colX = [90, width / 2, width - 90];

  const nodes = new Map<string, { type: string; col: number }>();
  for (const e of list) {
    const from = e.fromNodeRef ?? e.fromNodeId;
    const to = e.toNodeRef ?? e.toNodeId;
    if (from) nodes.set(from, { type: e.fromNodeType ?? "", col: columnFor(e.fromNodeType) });
    if (to) nodes.set(to, { type: e.toNodeType ?? "", col: columnFor(e.toNodeType) });
  }

  const byCol: Record<number, string[]> = { 0: [], 1: [], 2: [] };
  for (const [id, meta] of nodes) byCol[meta.col].push(id);

  const pos = new Map<string, { x: number; y: number; col: number }>();
  for (const col of [0, 1, 2]) {
    const ids = byCol[col];
    ids.forEach((id, i) => {
      const y = ids.length > 1 ? 40 + (i * (height - 80)) / (ids.length - 1) : height / 2;
      pos.set(id, { x: colX[col], y, col });
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">IURG Graph</CardTitle>
        <span className="text-xs text-slate-500">intent → constraint → enforcement</span>
      </CardHeader>
      <CardContent>
        {edges.isLoading ? (
          <p className="text-sm text-slate-500">Loading graph…</p>
        ) : nodes.size === 0 ? (
          <p className="text-sm text-slate-500">No bound intelligence graph edges yet.</p>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full" role="img" aria-label="IURG graph">
            {list.map((e, i) => {
              const from = pos.get(e.fromNodeRef ?? e.fromNodeId ?? "");
              const to = pos.get(e.toNodeRef ?? e.toNodeId ?? "");
              if (!from || !to) return null;
              return (
                <line
                  key={`e-${i}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#cbd5e1"
                  strokeWidth="1.2"
                />
              );
            })}
            {[...pos.entries()].map(([id, p]) => (
              <g key={id}>
                <circle cx={p.x} cy={p.y} r="6" fill={COLUMN_COLOR[p.col]} />
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px]"
                >
                  {id.length > 12 ? `${id.slice(0, 12)}…` : id}
                </text>
              </g>
            ))}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}
