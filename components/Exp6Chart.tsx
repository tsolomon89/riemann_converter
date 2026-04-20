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
import { Experiment6 } from "../lib/types";

interface Props {
  data: Experiment6;
}

export default function Exp6Chart({ data }: Props) {
  const chartData = Object.entries(data).map(([k, row]) => ({
    name: `K=${k}`,
    k: parseInt(k),
    beta_hat: row.beta_hat,
    rmse_opt: row.rmse_opt,
    rmse_05: row.rmse_05
  })).sort((a, b) => a.k - b.k);

  return (
    <div className="h-[400px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">
        Critical Line Drift (Beta Hat)
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="name" stroke="#666" />
          <YAxis stroke="#666" domain={[0.4, 0.6]} />
          <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
          <Legend />
          <ReferenceLine y={0.5} stroke="#10b981" label="critical line (0.5)" />
          
          <Line type="monotone" dataKey="beta_hat" stroke="#ef4444" strokeWidth={2} name="Optimized Beta" />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-gray-400 text-center">
         Deviation from 0.5 indicates a broken symmetry under scaling.
      </div>
    </div>
  );
}
