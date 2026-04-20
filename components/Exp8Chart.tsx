import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import type { Experiment8 } from "../lib/types";

interface Props {
    data: Experiment8;
    tolZero?: number;
    tolResidual?: number;
}

const safeNumber = (x: unknown): number | null =>
    typeof x === "number" && Number.isFinite(x) ? x : null;

export default function Exp8Chart({ data, tolZero, tolResidual }: Props) {
    const perK = data.per_k ?? {};
    const chartData = Object.entries(perK)
        .map(([k, row]) => {
            const metrics = row?.metrics ?? {};
            const p99 = safeNumber(metrics.p99_abs_dev);
            const p95 = safeNumber(metrics.p95_residual);
            return {
                name: `K=${k}`,
                k: parseInt(k, 10),
                p99_abs_dev: p99 ?? 0,
                p95_residual: p95 ?? 0,
                has_p99: p99 !== null,
                has_p95: p95 !== null,
                n_tested: safeNumber(metrics.n_tested) ?? undefined,
            };
        })
        .sort((a, b) => a.k - b.k);

    if (chartData.length === 0) {
        return (
            <div className="p-8 bg-black/20 rounded-xl border border-white/10 text-gray-500 text-xs font-mono">
                No per-k metrics in EXP_8 data. Re-run experiment 8 with `--run 8`.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="h-[400px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">
                    Scaled-Zeta Zero Deviation &middot; p99 |&Delta;| per k
                </h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#666" />
                        <YAxis stroke="#666" scale="log" domain={["auto", "auto"]} />
                        <Tooltip
                            contentStyle={{ backgroundColor: "#111", borderColor: "#333" }}
                            cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                        />
                        <Legend />
                        <Bar dataKey="p99_abs_dev" name="p99 |Δ| (zero-gap)" fill="#10b981" />
                        {tolZero !== undefined && Number.isFinite(tolZero) && (
                            <ReferenceLine
                                y={tolZero}
                                stroke="#f59e0b"
                                strokeDasharray="4 4"
                                label={{
                                    value: `tol_zero=${tolZero.toExponential(2)}`,
                                    fill: "#f59e0b",
                                    fontSize: 10,
                                }}
                            />
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="h-[320px] w-full bg-black/20 rounded-xl border border-white/10 p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">
                    Scaled-Zeta Residuals &middot; p95 residual per k
                </h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#666" />
                        <YAxis stroke="#666" scale="log" domain={["auto", "auto"]} />
                        <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333" }} />
                        <Legend />
                        <Bar dataKey="p95_residual" name="p95 residual" fill="#3b82f6" />
                        {tolResidual !== undefined && Number.isFinite(tolResidual) && (
                            <ReferenceLine
                                y={tolResidual}
                                stroke="#f59e0b"
                                strokeDasharray="4 4"
                                label={{
                                    value: `tol_residual=${tolResidual.toExponential(2)}`,
                                    fill: "#f59e0b",
                                    fontSize: 10,
                                }}
                            />
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="bg-emerald-900/10 border border-emerald-500/20 p-4 rounded text-sm text-emerald-200">
                <strong>Scaled-Zeta Equivalence:</strong> EXP_8 tests whether the zeros of
                ζ(s·τ<sup>k</sup>) match the τ<sup>k</sup>-scaled baseline zeros of ζ(s).
                Bars below the orange tolerance line indicate agreement within the adaptive
                precision budget. Bars above the line are candidate lattice disagreements —
                investigate before claiming equivalence.
            </div>
        </div>
    );
}
