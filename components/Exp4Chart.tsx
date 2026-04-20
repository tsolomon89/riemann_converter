import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { Experiment4, Exp4Row } from "../lib/types";

interface Props {
  data: Experiment4;
}

export default function Exp4Chart({ data }: Props) {
  // Transform to array
  const chartData = Object.entries(data).map(([k, row]) => ({
    name: `K=${k}`,
    k: parseInt(k),
    rmse_trans: row.rmse_trans,
    rmse_dil: row.rmse_dil,
    winner: row.winner,
    delta_err: row.delta_error
  })).sort((a, b) => a.k - b.k);

  return (
    <div className="h-[400px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">
        Translation (Blue) vs Dilation (Orange) RMSE
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="name" stroke="#666" />
          <YAxis stroke="#666" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111', borderColor: '#333' }}
            cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
          />
          <Legend />
          <Bar dataKey="rmse_trans" name="Translation RMSE (Coord)" fill="#3b82f6" />
          <Bar dataKey="rmse_dil" name="Dilation RMSE (Operator)" fill="#f97316" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-gray-400 text-center">
        Lower RMSE indicates the better fitting model. 
        Blue winning = Coordinate Effect. Orange winning = Operator Effect.
      </div>
    </div>
  );
}
