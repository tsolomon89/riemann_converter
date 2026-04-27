"use client";

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

type DataPoint = {
  x: string; // Keep as string for display precision if needed, but recharts needs numbers
  y: number;
  prime: number;
};

type SeriesData = {
  k: number;
  scale_factor: string;
  data: DataPoint[];
};

type PrimeStepperChartProps = {
  data: SeriesData[];
  visibleK: number[]; // Array of k values to show
};

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
};

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0a0f18]/95 backdrop-blur-xl border border-blue-500/20 p-4 rounded-none shadow-2xl text-xs text-white ring-1 ring-blue-500/10 min-w-[200px]">
        <div className="mb-3 border-b border-white/10 pb-2">
            <span className="font-gauss text-gray-400 italic mr-2">x =</span>
            <span className="font-mono text-emerald-400 text-sm tracking-tight">{Number(label).toFixed(8)}...</span>
        </div>
        <div className="space-y-2">
          {payload.map((entry) => (
            <div key={String(entry.name)} className="flex justify-between items-center gap-4">
              <span className="font-gauss text-gray-300 italic" style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-mono font-bold text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function PrimeStepperChart({ data, visibleK }: PrimeStepperChartProps) {
  const chartData = useMemo(() => {
    // Convert all series to events: { x, k, newY }
    const events: { x: number, k: number, y: number }[] = [];
    data.forEach(series => {
         if (!visibleK.includes(series.k)) return;
         series.data.forEach(pt => {
             events.push({ x: parseFloat(pt.x), k: series.k, y: pt.y });
         });
    });
    
    events.sort((a, b) => a.x - b.x);
    
    const finalPoints: Array<Record<string, number>> = [];
    const runningY: Record<number, number> = {};
    data.forEach(s => runningY[s.k] = 0);
    
    // Add a start point at 0
    finalPoints.push({ x: 0, ...runningY });

    events.forEach(e => {
        runningY[e.k] = e.y;
        // Clone runningY for this point
        finalPoints.push({ x: e.x, ...runningY });
    });
    
    return finalPoints;
  }, [data, visibleK]);

  // Generate colors for K
  const getColor = (k: number) => {
      // Gauss/Gemini Palette: Blues, Cyans, Emeralds, Purples
      // k ranges -2 to 2 typically.
      const map: Record<number, string> = {
          "-2": "#6366f1", // Indigo
          "-1": "#3b82f6", // Blue
          "0": "#10b981",  // Emerald (Base interaction)
          "1": "#06b6d4",  // Cyan
          "2": "#8b5cf6",  // Violet
      };
      return map[k] || "#ffffff";
  };

  return (
    <div className="w-full h-full min-h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3a5a" opacity={0.3} vertical={true} />
          <XAxis 
            dataKey="x" 
            type="number" 
            domain={['auto', 'auto']} 
            stroke="#475569" 
            tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <YAxis 
            stroke="#475569" 
            tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontFamily: 'Times New Roman', fontStyle: 'italic', paddingTop: '10px' }} />
          
          {visibleK.map(k => (
            <Line
              key={k}
              type="stepAfter" // The step logic
              dataKey={k}
              name={`π(x) at scale τ^${k}`}
              stroke={getColor(k)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
              animationDuration={500}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
