import React from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import type { Experiment10 } from "../lib/types";

interface ZetaTransportChartProps {
  data: Experiment10;
  height?: number;
}

const BASE_COLORS: Record<string, string> = {
  tau: "#10b981",        // emerald
  sqrt2: "#3b82f6",      // blue
  e: "#f59e0b",          // amber
  phi: "#8b5cf6",        // violet
  baseline_1p0001: "#94a3b8", // slate (sanity)
};

const BASE_LABELS: Record<string, string> = {
  tau: "τ = 2π",
  sqrt2: "√2",
  e: "e",
  phi: "φ",
  baseline_1p0001: "1.0001 (sanity)",
};

const fmt = (v: number | undefined) =>
  v === undefined ? "—" : Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6 ? v.toExponential(3) : v.toFixed(4);

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-mono uppercase tracking-widest text-amber-300 mb-3">{children}</div>
);

const KAxisTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#0a0f18]/95 backdrop-blur-xl border border-amber-500/20 p-3 shadow-2xl text-xs text-white min-w-[220px]">
      <div className="mb-2 border-b border-white/10 pb-2">
        <span className="font-serif text-gray-400 italic mr-2">k =</span>
        <span className="font-mono text-amber-400">{label}</span>
      </div>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.name)} className="flex justify-between gap-4">
            <span className="font-serif italic" style={{ color: p.color }}>{p.name}:</span>
            <span className="font-mono font-bold">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TAxisTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#0a0f18]/95 backdrop-blur-xl border border-emerald-500/20 p-3 shadow-2xl text-xs text-white min-w-[200px]">
      <div className="mb-2 border-b border-white/10 pb-2">
        <span className="font-serif text-gray-400 italic mr-2">t =</span>
        <span className="font-mono text-emerald-400">{Number(label).toFixed(3)}</span>
      </div>
      {payload.map((p) => (
        <div key={String(p.name)} className="flex justify-between gap-4">
          <span className="font-serif italic" style={{ color: p.color }}>{p.name}:</span>
          <span className="font-mono font-bold">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function ZetaTransportChart({ data, height = 360 }: ZetaTransportChartProps) {
  if (!data?.bases || !data?.config) {
    return (
      <div className="h-[360px] flex items-center justify-center text-gray-500 text-sm">
        No transport data available. Run TRANS-1 to populate.
      </div>
    );
  }

  const bases = Object.keys(data.bases);
  const kValues = data.config.k_values ?? [];

  // Panel 1: max|residual| vs k, one line per base
  const panel1Rows = kValues.map((k) => {
    const row: Record<string, number | string> = { k };
    for (const base of bases) {
      const stats = data.bases?.[base]?.[String(k)];
      if (stats) row[base] = stats.max;
    }
    return row;
  });

  // Panel 2: per-t residual at the worst-case k (largest k by default)
  const worstK = kValues.length > 0 ? kValues[kValues.length - 1] : 0;
  const T0 = data.config.T0 ?? 0;
  const L = data.config.L ?? 0;
  const M = data.config.M ?? 0;
  const tStep = M > 1 ? L / (M - 1) : 0;

  // Build per-t rows by interleaving raw_residuals across bases at worstK.
  const panel2Rows: Record<string, number>[] = [];
  if (M > 0) {
    const baseRaws: Record<string, number[] | undefined> = {};
    for (const base of bases) {
      baseRaws[base] = data.bases?.[base]?.[String(worstK)]?.raw_residuals;
    }
    for (let i = 0; i < M; i++) {
      const t = T0 + i * tStep;
      const row: Record<string, number> = { t };
      for (const base of bases) {
        const arr = baseRaws[base];
        if (arr && i < arr.length) row[base] = arr[i];
      }
      panel2Rows.push(row);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/10 bg-black/40 p-4">
        <PanelTitle>Panel 1 · max │ζ(½+it) − ζ(½+i·c<sup>k</sup>·t)│ vs k (log y)</PanelTitle>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={panel1Rows} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="k" tick={{ fill: "#94a3b8", fontSize: 11 }} label={{ value: "k", position: "insideBottom", offset: -10, fill: "#94a3b8" }} />
              <YAxis scale="log" domain={["auto", "auto"]} allowDataOverflow tickFormatter={(v) => Number(v).toExponential(0)} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip content={<KAxisTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {bases.map((base) => (
                <Line
                  key={base}
                  type="monotone"
                  dataKey={base}
                  stroke={BASE_COLORS[base] ?? "#fff"}
                  strokeWidth={1.5}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                  name={BASE_LABELS[base] ?? base}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/40 p-4">
        <PanelTitle>Panel 2 · │residual│(t) at k={worstK} (deepest gauge)</PanelTitle>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={panel2Rows} margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={{ fill: "#94a3b8", fontSize: 11 }} label={{ value: "t", position: "insideBottom", offset: -10, fill: "#94a3b8" }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => Number(v).toExponential(0)} />
              <Tooltip content={<TAxisTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {bases.map((base) => (
                <Line
                  key={base}
                  type="monotone"
                  dataKey={base}
                  stroke={BASE_COLORS[base] ?? "#fff"}
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                  name={BASE_LABELS[base] ?? base}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
