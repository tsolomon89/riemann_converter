import React from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart
} from "recharts";

type ResearchChartRow = Record<string, number | string | null | undefined>;

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

interface ResearchChartProps {
  data: ResearchChartRow[]; // Expects merged data
  activeK: number[]; // List of active Ks
  scaleFactors: Record<number, string>; // Map of K to scale factor string
  showTruePi?: boolean; 
  showLi?: boolean;
  xAxisDataKey?: string; // 'X' or 'eff_x'
  xScale?: 'linear' | 'log';
}

const K_COLORS: Record<number, string> = {
  "-2": "#f43f5e", // Rose
  "-1": "#f97316", // Orange
  0: "#10b981",  // Emerald
  1: "#3b82f6",  // Blue
  2: "#8b5cf6",  // Violet
};

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (active && payload && payload.length) {
    const labelNum = Number(label);
    const labelStr = labelNum > 1000 ? labelNum.toExponential(4) : labelNum.toFixed(4);
    
    return (
      <div className="bg-[#0a0f18]/95 backdrop-blur-xl border border-blue-500/20 p-4 shadow-2xl text-xs text-white ring-1 ring-blue-500/10 min-w-[240px]">
        <div className="mb-3 border-b border-white/10 pb-2">
            <span className="font-serif text-gray-400 italic mr-2">X =</span>
            <span className="font-mono text-emerald-400 text-sm tracking-tight">{labelStr}</span>
        </div>
        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
          {payload.map((entry) => (
            <div key={String(entry.name)} className="flex justify-between items-center gap-4">
              <span className="font-serif text-gray-300 italic" style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-mono font-bold text-white">
                {Number(entry.value).toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function RiemannResearchChart({
  data,
  activeK,
  scaleFactors,
  showTruePi = true,
  showLi = true,
  xAxisDataKey = "X",
  xScale = "linear"
}: ResearchChartProps) {
  
  return (
    <div className="w-full h-[600px] bg-black/20 rounded-xl border border-white/5 p-4 relative overflow-hidden group">
      {/* Background Grid Effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
      
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end pointer-events-none space-y-1">
         <div className="font-mono text-xs text-blue-400/50 mb-1">ACTIVE SCALES</div>
         {activeK.map(k => (
             <div key={k} className="font-serif text-sm italic" style={{ color: K_COLORS[k] || "#fff" }}>
                 τ<sup>{k}</sup> ≈ {Number(scaleFactors[k] || 0).toFixed(2)}
             </div>
         ))}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis 
            dataKey={xAxisDataKey} 
            type="number"
            scale={xScale}
            domain={['auto', 'auto']}
            allowDataOverflow
            stroke="#ffffff40" 
            tick={{ fill: "#ffffff60", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => val > 1000 ? Number(val).toExponential(1) : Number(val).toFixed(1)}
          />
          <YAxis 
            stroke="#ffffff40" 
            tick={{ fill: "#ffffff60", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ffffff20' }} />

          {showLi && (
            <Line
              type="monotone"
              dataKey="Li"
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="Li(x)"
              isAnimationActive={false}
              connectNulls={true}
            />
          )}

          {/* Reconstruction Lines */}
          {activeK.flatMap(k => {
             const color = K_COLORS[k] || "#ffffff";
             const lines = [];
             
             // The Dynamic Reconstruction Curve
             lines.push(
               <Line
                  key={`rec-${k}`}
                  type="monotone"
                  dataKey={`K${k}_Reconstruction`}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  name={`π(x/τ^${k})`}
                  animationDuration={0} 
                  isAnimationActive={false}
                  connectNulls={true}
               />
             );

             // True Pi Step Function (Scaled)
             if (showTruePi) {
               lines.push(
                 <Line
                    key={`pi-${k}`}
                    type="stepAfter"
                    dataKey={`K${k}_TruePi`}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    dot={false}
                    name={`True π(x/τ^${k})`}
                    isAnimationActive={false}
                    connectNulls={true}
                 />
               );
             }
             return lines;
          })}

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
