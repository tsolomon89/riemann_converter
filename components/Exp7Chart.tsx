import { 
  LineChart, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer
} from "recharts";
import { Experiment7 } from "../lib/types";

interface Props {
  data: Experiment7;
}

export default function Exp7Chart({ data }: Props) {
  const calibrated = Array.isArray(data?.calibrated) ? data.calibrated : [];
  if (calibrated.length === 0) {
    return <div className="text-gray-500 p-8">No calibrated data for Exp 7</div>;
  }

  const chartData = calibrated.map((pt) => ({
      epsilon: pt.epsilon,
      max_amp: pt.max_amp,
      mean_amp: pt.mean_amp
  })).sort((a, b) => a.epsilon - b.epsilon);

  return (
    <div className="h-[400px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">
        Centrifuge Sensitivity (Amplification vs Epsilon)
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="epsilon" stroke="#666" label={{ value: 'Perturbation (ε)', position: 'bottom', fill: '#666' }} />
          <YAxis stroke="#666" label={{ value: 'Amplification Factor A', angle: -90, position: 'insideLeft' }} />
          <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
          <Legend />
          
          <Line type="monotone" dataKey="max_amp" stroke="#d946ef" strokeWidth={2} name="Max Amplification" />
          <Line type="monotone" dataKey="mean_amp" stroke="#8b5cf6" strokeDasharray="5 5" name="Mean Amplification" />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-gray-400 text-center">
         Program 2 exploratory. Monotonic growth of A(ε) across the swept perturbations is consistent with the centrifuge being sensitive on this run&apos;s settings.
      </div>
    </div>
  );
}
