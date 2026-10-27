import { cn } from "./cn";

// Phase 6 (PRP-6 D9, Roberto: simple and light): grouped bar chart in plain SVG, no chart library. Shared with the
// mobile admin app (Phase 7). Each bar has a <title> with its value; the series legend sits under the chart.

export type BarSeries = { name: string; className: string };
export type BarDatum = { label: string; values: number[] };

export function BarChart({
  data,
  series,
  format = (v) => String(v),
  height = 180,
  className,
  ariaLabel,
}: {
  data: BarDatum[];
  series: BarSeries[];
  format?: (value: number) => string;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const groupWidth = 100 / Math.max(1, data.length);
  const barWidth = (groupWidth * 0.8) / Math.max(1, series.length);
  // Label every day when there are few; otherwise about eight labels along the axis.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
      >
        <line
          x1="0"
          x2="100"
          y1={height}
          y2={height}
          className="stroke-border"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) =>
          d.values.map((value, s) => {
            const h = (Math.max(0, value) / max) * (height - 4);
            return (
              <rect
                key={`${i}-${s}`}
                x={i * groupWidth + groupWidth * 0.1 + s * barWidth}
                y={height - h}
                width={Math.max(barWidth - 0.3, 0.2)}
                height={h}
                rx={0.4}
                className={series[s]?.className}
              >
                <title>{`${d.label} · ${series[s]?.name}: ${format(value)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="relative h-4 text-[10px] text-muted-foreground" aria-hidden>
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <span
              key={d.label}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(i + 0.5) * groupWidth}%` }}
            >
              {d.label}
            </span>
          ) : null,
        )}
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <rect width="10" height="10" rx="2" className={s.className} />
            </svg>
            {s.name}
          </span>
        ))}
        <span className="ml-auto">Máximo: {format(max)}</span>
      </figcaption>
    </figure>
  );
}
