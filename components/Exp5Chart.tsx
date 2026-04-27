import { 
  LineChart, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { Experiment5 } from "../lib/types";

interface Props {
  data: Experiment5;
}

export default function Exp5Chart({ data }: Props) {
  // Transform
  const chartData = Object.entries(data).map(([k, row]) => ({
    name: `K=${k}`,
    k: parseInt(k),
    median_z: row.median_z,
    p95_z: row.p95_z
  })).sort((a, b) => a.k - b.k);

  return (
    <div className="h-[400px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">
        Zero Correspondence Mismatch (z-score)
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="name" stroke="#666" />
          <YAxis stroke="#666" label={{ value: 'Mismatch (mean spacings)', angle: -90, position: 'insideLeft' }}/>
          <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
          <Legend />
          <ReferenceLine y={0.1} stroke="#10b981" strokeDasharray="3 3" label="Lock Threshold (0.1)" />
          <ReferenceLine y={0.25} stroke="#eab308" strokeDasharray="3 3" label="Weak Threshold (0.25)" />
          
          <Line type="monotone" dataKey="median_z" stroke="#3b82f6" strokeWidth={2} name="Median Mismatch" />
          <Line type="monotone" dataKey="p95_z" stroke="#6366f1" strokeDasharray="5 5" name="95th % Mismatch" />
        </LineChart>
      </ResponsiveContainer>
       <div className="mt-2 text-xs text-gray-400 text-center">
        Values &lt; 0.1 indicate &quot;Spectral Locking&quot; (Zeros map to Zeros). 
        Values around 0.5 indicate random distribution.
      </div>
    </div>
  );
}
