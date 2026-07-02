"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ActivityPoint {
  label: string;
  value: number;
}

/**
 * Dependency-free line chart rendered as inline SVG (recharts is not a
 * dependency). Draws a 7-point activity trend with a filled gradient area.
 */
export function ActivityChart({
  title,
  points,
}: {
  title: string;
  points: ActivityPoint[];
}) {
  const width = 720;
  const height = 220;
  const padX = 32;
  const padY = 24;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * stepX;
    const y = height - padY - (p.value / max) * (height - padY * 2);
    return { x, y, ...p };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padY} L ${coords[0].x.toFixed(
          1,
        )} ${height - padY} Z`
      : "";

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full"
          role="img"
          aria-label={title}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="onx-activity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1={padX}
              x2={width - padX}
              y1={padY + g * (height - padY * 2)}
              y2={padY + g * (height - padY * 2)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          ))}
          {areaPath ? <path d={areaPath} fill="url(#onx-activity)" /> : null}
          {linePath ? (
            <path d={linePath} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinejoin="round" />
          ) : null}
          {coords.map((c) => (
            <g key={c.label}>
              <circle cx={c.x} cy={c.y} r="3.5" fill="#0d9488" />
              <text x={c.x} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {c.label}
              </text>
            </g>
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}
