import React from 'react';
import {
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  ReferenceLine,
} from "recharts";

export type PolarSample = { t: number; re: number; im: number };
export type ZeroMarker = { index: number; t: number; re: number; im: number; marker: string };
export type DualSample = { t_orig?: number; t_compressed?: number; t?: number; re: number; im: number };

interface PolarTraceData {
  samples: PolarSample[];
  zero_markers: ZeroMarker[];
  config?: { t_start?: number; t_end?: number; point_count?: number; dps?: number };
}

interface DualWindowData {
  uncompressed: DualSample[];
  compressed: DualSample[];
  config?: {
    T?: number;
    L?: number;
    k?: number;
    base_name?: string;
    base_value?: number;
    scale?: number;
    compressed_t_range?: [number, number];
  };
}

interface ZetaPolarChartProps {
  mode: "polar" | "dual";
  polarTrace?: PolarTraceData;
  dualWindow?: DualWindowData;
  /** Cartesian grid side length in pixels. */
  height?: number;
}

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

const PolarTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload || {};
  const t = (data.t ?? data.t_orig) as number | undefined;
  const tComp = data.t_compressed as number | undefined;
  const re = data.re as number | undefined;
  const im = data.im as number | undefined;

  const fmt = (v: number | undefined) =>
    v === undefined ? "—" : Math.abs(v) > 1000 ? v.toExponential(4) : v.toFixed(4);

  return (
    <div className="bg-[#0a0f18]/95 backdrop-blur-xl border border-emerald-500/20 p-4 shadow-2xl text-xs text-white ring-1 ring-emerald-500/10 min-w-[240px]">
      <div className="mb-3 border-b border-white/10 pb-2">
        {t !== undefined && (
          <div>
            <span className="font-serif text-gray-400 italic mr-2">t =</span>
            <span className="font-mono text-emerald-400 text-sm">{fmt(t)}</span>
          </div>
        )}
        {tComp !== undefined && (
          <div className="mt-1">
            <span className="font-serif text-gray-400 italic mr-2">τ·t =</span>
            <span className="font-mono text-amber-400 text-sm">{fmt(tComp)}</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="font-serif text-gray-300 italic">Re ζ:</span>
          <span className="font-mono font-bold text-white">{fmt(re)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="font-serif text-gray-300 italic">Im ζ:</span>
          <span className="font-mono font-bold text-white">{fmt(im)}</span>
        </div>
      </div>
    </div>
  );
};

// Keep the Cartesian plotting region square; the chart shell includes axis space.
const CHART_MARGIN = { top: 24, right: 28, bottom: 34, left: 10 };
const X_AXIS_HEIGHT = 44;
const Y_AXIS_WIDTH = 64;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const squareDomain = (points: Array<{ re?: number; im?: number }>) => {
  const xs = points.map((point) => point.re).filter(finite);
  const ys = points.map((point) => point.im).filter(finite);

  if (xs.length === 0 || ys.length === 0) {
    return { x: ["auto", "auto"] as const, y: ["auto", "auto"] as const };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const rawSpan = Math.max(maxX - minX, maxY - minY);
  const span = (rawSpan > 0 ? rawSpan : 1) * 1.08;
  const half = span / 2;

  return {
    x: [centerX - half, centerX + half] as [number, number],
    y: [centerY - half, centerY + half] as [number, number],
  };
};

function SquareChartFrame({
  gridSide,
  children,
}: {
  gridSide: number;
  children: React.ReactNode;
}) {
  const width = gridSide + Y_AXIS_WIDTH + CHART_MARGIN.left + CHART_MARGIN.right;
  const height = gridSide + X_AXIS_HEIGHT + CHART_MARGIN.top + CHART_MARGIN.bottom;

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="mx-auto" style={{ width, height }}>
        {children}
      </div>
    </div>
  );
}

export default function ZetaPolarChart({
  mode,
  polarTrace,
  dualWindow,
  height = 640,
}: ZetaPolarChartProps) {
  const gridSide = height;
  const chartWidth = gridSide + Y_AXIS_WIDTH + CHART_MARGIN.left + CHART_MARGIN.right;
  const chartHeight = gridSide + X_AXIS_HEIGHT + CHART_MARGIN.top + CHART_MARGIN.bottom;

  if (mode === "polar") {
    if (!polarTrace || !polarTrace.samples?.length) {
      return (
        <SquareChartFrame gridSide={gridSide}>
          <div className="flex h-full items-center justify-center text-gray-500 text-sm">
            No polar trace data available. Run ZETA-0 to populate.
          </div>
        </SquareChartFrame>
      );
    }
    const domains = squareDomain([
      ...polarTrace.samples,
      ...(polarTrace.zero_markers ?? []),
    ]);

    return (
      <SquareChartFrame gridSide={gridSide}>
        <ComposedChart
          width={chartWidth}
          height={chartHeight}
          data={polarTrace.samples}
          margin={CHART_MARGIN}
        >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="re"
              domain={domains.x}
              tickCount={7}
              height={X_AXIS_HEIGHT}
              tick={{ fill: "#94a3b8", fontSize: 13 }}
              label={{ value: "Re ζ(½ + it)", position: "insideBottom", offset: -10, fill: "#94a3b8" }}
            />
            <YAxis
              type="number"
              dataKey="im"
              domain={domains.y}
              tickCount={7}
              width={Y_AXIS_WIDTH}
              tick={{ fill: "#94a3b8", fontSize: 13 }}
              label={{ value: "Im ζ(½ + it)", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
            />
            <ReferenceLine x={0} stroke="#475569" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
            <Tooltip content={<PolarTooltip />} />
            <Line
              type="monotone"
              dataKey="im"
              data={polarTrace.samples}
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="ζ(½+it)"
            />
            {polarTrace.zero_markers && polarTrace.zero_markers.length > 0 && (
              <Scatter
                data={polarTrace.zero_markers}
                fill="#f43f5e"
                shape="circle"
                name="Zero markers"
                isAnimationActive={false}
              />
            )}
        </ComposedChart>
      </SquareChartFrame>
    );
  }

  // dual mode
  if (!dualWindow || !dualWindow.uncompressed?.length || !dualWindow.compressed?.length) {
    return (
      <SquareChartFrame gridSide={gridSide}>
        <div className="flex h-full items-center justify-center text-gray-500 text-sm">
          No dual-window data available. Run ZETA-0 to populate.
        </div>
      </SquareChartFrame>
    );
  }

  const cfg = dualWindow.config || {};
  const domains = squareDomain([
    ...dualWindow.uncompressed,
    ...dualWindow.compressed,
  ]);

  return (
    <SquareChartFrame gridSide={gridSide}>
      <ComposedChart
        width={chartWidth}
        height={chartHeight}
        margin={CHART_MARGIN}
      >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            type="number"
            dataKey="re"
            domain={domains.x}
            tickCount={7}
            height={X_AXIS_HEIGHT}
            tick={{ fill: "#94a3b8", fontSize: 13 }}
            label={{ value: "Re ζ(½ + it)", position: "insideBottom", offset: -10, fill: "#94a3b8" }}
          />
          <YAxis
            type="number"
            dataKey="im"
            domain={domains.y}
            tickCount={7}
            width={Y_AXIS_WIDTH}
            tick={{ fill: "#94a3b8", fontSize: 13 }}
            label={{ value: "Im ζ(½ + it)", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
          />
          <ReferenceLine x={0} stroke="#475569" strokeDasharray="4 4" />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
          <Tooltip content={<PolarTooltip />} />
          <Line
            type="monotone"
            dataKey="im"
            data={dualWindow.uncompressed}
            stroke="#10b981"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name={`Uncompressed: t∈[${cfg.T}, ${(cfg.T ?? 0) + (cfg.L ?? 0)}]`}
          />
          <Line
            type="monotone"
            dataKey="im"
            data={dualWindow.compressed}
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            isAnimationActive={false}
            name={`Compressed: ${cfg.base_name}^${cfg.k}·t`}
          />
      </ComposedChart>
    </SquareChartFrame>
  );
}
