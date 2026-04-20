import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart
} from "recharts";

interface ErrorChartProps {
  data: any[];
  k: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0a0f18]/95 backdrop-blur-xl border border-red-500/20 p-4 shadow-2xl text-xs text-white ring-1 ring-red-500/10 min-w-[200px]">
        <div className="mb-3 border-b border-white/10 pb-2">
            <span className="font-serif text-gray-400 italic mr-2">X =</span>
            <span className="font-mono text-emerald-400 text-sm tracking-tight">{Number(label).toFixed(4)}</span>
        </div>
        <div className="space-y-1">
          {payload.map((entry: any) => (
            <div key={entry.name} className="flex justify-between items-center gap-4">
              <span className="font-serif text-gray-300 italic" style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-mono font-bold text-white">
                {Number(entry.value).toExponential(4)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function ErrorAnalysisChart({ data, k }: ErrorChartProps) {
  // Pre-process data to calculate errors
  const processedData = data.map(row => {
      const li = parseFloat(row.Li);
      const pi = row.TruePi;
      const error = Math.abs(pi - li);
      
      // Also error for reconstructions? 
      // User asked for: |pi(x) - Li(x)| vs Bound
      
      return {
          ...row,
          ErrorTerm: error,
          BoundValue: parseFloat(row.SchoenfeldBound || "0")
      };
  });

  return (
    <div className="w-full h-[400px] w-full bg-black/20 rounded-xl border border-red-500/10 p-4 relative overflow-hidden group">
      <div className="absolute top-4 right-4 z-10 font-serif text-sm text-red-400/50 italic">
        Schoenfeld Error Analysis (k={k})
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={processedData}
          margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
          <XAxis 
            dataKey="X" 
            stroke="#ffffff40" 
            tick={{ fill: "#ffffff60", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#ffffff40" 
            tick={{ fill: "#ffffff60", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ffffff20' }} />

          {/* The Bound Area */}
          <Area
            type="monotone"
            dataKey="BoundValue"
            stroke="none"
            fill="rgba(239, 68, 68, 0.1)"
            name="Schoenfeld Bound"
          />
          <Line
             type="monotone"
             dataKey="BoundValue"
             stroke="#ef4444"
             strokeDasharray="3 3"
             strokeWidth={1}
             dot={false}
             name="Bound RHS"
          />

          {/* The Actual Error */}
          <Line
            type="monotone"
            dataKey="ErrorTerm"
            stroke="#fbbf24" // Amber
            strokeWidth={2}
            dot={false}
            name="|π(x) - Li(x)|"
          />

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
