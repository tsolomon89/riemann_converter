import React from 'react';
import {
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

export default function ZetaPolarChart({
  mode,
  polarTrace,
  dualWindow,
  height = 480,
}: ZetaPolarChartProps) {
  if (mode === "polar") {
    if (!polarTrace || !polarTrace.samples?.length) {
      return (
        <div className="h-[480px] flex items-center justify-center text-gray-500 text-sm">
          No polar trace data available. Run ZETA-0 to populate.
        </div>
      );
    }
    return (
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={polarTrace.samples} margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              type="number"
              dataKey="re"
              domain={["auto", "auto"]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              label={{ value: "Re ζ(½ + it)", position: "insideBottom", offset: -10, fill: "#94a3b8" }}
            />
            <YAxis
              type="number"
              dataKey="im"
              domain={["auto", "auto"]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
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
        </ResponsiveContainer>
      </div>
    );
  }

  // dual mode
  if (!dualWindow || !dualWindow.uncompressed?.length || !dualWindow.compressed?.length) {
    return (
      <div className="h-[480px] flex items-center justify-center text-gray-500 text-sm">
        No dual-window data available. Run ZETA-0 to populate.
      </div>
    );
  }

  const cfg = dualWindow.config || {};

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            type="number"
            dataKey="re"
            domain={["auto", "auto"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            label={{ value: "Re ζ(½ + it)", position: "insideBottom", offset: -10, fill: "#94a3b8" }}
          />
          <YAxis
            type="number"
            dataKey="im"
            domain={["auto", "auto"]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
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
      </ResponsiveContainer>
    </div>
  );
}
