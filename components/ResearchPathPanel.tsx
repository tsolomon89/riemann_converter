"use client";

import React from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    FileWarning,
    GitBranch,
    Loader2,
    Target,
} from "lucide-react";

type AssetRef = {
    asset_id?: string;
    kind?: string;
    role?: string;
    source_path?: string | null;
    count?: number | null;
    max_prime?: number | null;
    max_value?: number | string | null;
    stored_dps?: number | null;
    valid?: boolean;
};

type RequiredAsset = {
    kind: string;
    count?: number;
    stored_dps?: number;
    max_prime?: number;
    max_value?: number;
    formula?: string;
};

type Sufficiency = {
    status: string;
    required_assets: RequiredAsset[];
    available_assets: Array<{ required: RequiredAsset; available: AssetRef | null }>;
    missing_assets: Array<{ kind?: string }>;
    insufficient_assets: Array<{ kind?: string; status?: string; reason?: string; available?: AssetRef; required?: RequiredAsset }>;
    warnings: string[];
    next_action: string | null;
    requirements?: {
        requested_dps?: number;
        guard_dps?: number;
        required_stored_dps?: number;
    };
};

type ResearchPlan = {
    current_node: string;
    recommended_next_action: string;
    why: string;
    stop_condition: string;
    proof_work_recommended: boolean;
};

type NextAction = {
    next_action: string;
    command?: string | null;
    target?: string;
    why?: string;
    blocks: string[];
    data_sufficiency: Sufficiency;
    research_plan: ResearchPlan;
};

type Envelope = {
    data?: {
        input?: {
            requested_dps?: number;
            requested_zero_count?: number;
            guard_dps?: number;
        };
        next?: NextAction;
        plain_language_summary?: string;
        warnings?: string[];
        next_action?: string | null;
    };
};

const KIND_LABELS: Record<string, string> = {
    tau: "Tau",
    nontrivial_zeta_zeros: "Nontrivial zeros",
    trivial_zeta_zeros: "Trivial zeros",
    primes: "Primes",
};

const statusClass = (status: string) => {
    if (status === "READY") return "text-emerald-300 bg-emerald-950/30 border-emerald-500/30";
    if (status === "MISSING" || status === "INSUFFICIENT_PRECISION" || status === "INSUFFICIENT_COUNT") {
        return "text-amber-300 bg-amber-950/30 border-amber-500/30";
    }
    if (status === "INVALID" || status === "BLOCKED") return "text-red-300 bg-red-950/30 border-red-500/30";
    return "text-zinc-300 bg-zinc-900/50 border-zinc-700/50";
};

const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "n/a";
    if (typeof value === "number") return value.toLocaleString();
    return String(value);
};

const findAvailability = (sufficiency: Sufficiency, kind: string) =>
    sufficiency.available_assets.find((item) => item.required.kind === kind);

const assetStatus = (sufficiency: Sufficiency, kind: string) => {
    if (sufficiency.missing_assets.some((item) => item.kind === kind)) return "MISSING";
    const insufficient = sufficiency.insufficient_assets.find((item) => item.kind === kind);
    if (insufficient) return insufficient.status ?? insufficient.reason ?? "INSUFFICIENT";
    return "READY";
};

function ReadinessRow({ sufficiency, kind }: { sufficiency: Sufficiency; kind: string }) {
    const availability = findAvailability(sufficiency, kind);
    const status = assetStatus(sufficiency, kind);
    const available = availability?.available;
    const required = availability?.required;

    return (
        <div className="grid grid-cols-[minmax(100px,1fr)_auto] gap-3 border-b border-white/5 py-2 last:border-b-0">
            <div className="min-w-0">
                <div className="text-[11px] font-semibold text-zinc-200">{KIND_LABELS[kind] ?? kind}</div>
                <div className="mt-0.5 truncate text-[10px] font-mono text-zinc-500">
                    {available?.source_path ?? (required?.formula ? required.formula : "no canonical asset")}
                </div>
            </div>
            <span className={`self-start rounded border px-2 py-0.5 text-[9px] font-mono ${statusClass(status)}`}>
                {status}
            </span>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: unknown }) {
    return (
        <div className="flex items-baseline justify-between gap-3 text-[10px]">
            <span className="text-zinc-500">{label}</span>
            <code className="text-right font-mono text-zinc-300">{formatValue(value)}</code>
        </div>
    );
}

export default function ResearchPathPanel({ id }: { id?: string }) {
    const [payload, setPayload] = React.useState<Envelope | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        fetch("/api/research/next-action", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: Envelope | null) => {
                if (!cancelled) setPayload(body);
            })
            .catch(() => {
                if (!cancelled) setPayload(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const next = payload?.data?.next;
    if (loading) {
        return (
            <section id={id} className="rounded-lg border border-zinc-700/50 bg-zinc-950/40 p-4">
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                    <Loader2 size={14} className="animate-spin" />
                    Research Path
                </div>
            </section>
        );
    }
    if (!next) return null;

    const sufficiency = next.data_sufficiency;
    const input = payload?.data?.input ?? {};
    const prime = findAvailability(sufficiency, "primes")?.available;
    const zero = findAvailability(sufficiency, "nontrivial_zeta_zeros")?.available;
    const requiredZero = findAvailability(sufficiency, "nontrivial_zeta_zeros")?.required;
    const requiredTau = findAvailability(sufficiency, "tau")?.required;
    const requestedDps = input.requested_dps ?? sufficiency.requirements?.requested_dps;
    const guardDps = input.guard_dps ?? sufficiency.requirements?.guard_dps;
    const requiredStoredDps = requiredTau?.stored_dps ?? sufficiency.requirements?.required_stored_dps;

    return (
        <section id={id} className="rounded-lg border border-cyan-500/25 bg-cyan-950/10 p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-cyan-300">
                        <GitBranch size={14} />
                        Research Path
                    </div>
                    <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-zinc-400">
                        {next.why}
                    </p>
                </div>
                <span className={`rounded border px-2 py-1 text-[10px] font-mono ${statusClass(sufficiency.status)}`}>
                    {sufficiency.status}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <Database size={13} />
                            Data Readiness
                        </div>
                        {["tau", "nontrivial_zeta_zeros", "trivial_zeta_zeros", "primes"].map((kind) => (
                            <ReadinessRow key={kind} sufficiency={sufficiency} kind={kind} />
                        ))}
                    </div>

                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <Target size={13} />
                            Precision
                        </div>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                            <Metric label="requested dps" value={requestedDps} />
                            <Metric label="guard dps" value={guardDps} />
                            <Metric label="required stored dps" value={requiredStoredDps} />
                            <Metric label="zero stored dps" value={zero?.stored_dps} />
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <CheckCircle2 size={13} />
                            Prime Asset
                        </div>
                        <div className="space-y-1">
                            <Metric label="count" value={prime?.count ? `~${prime.count.toLocaleString()}` : undefined} />
                            <Metric label="max prime" value={prime?.max_prime ?? prime?.max_value} />
                            <Metric label="status" value={assetStatus(sufficiency, "primes")} />
                            <Metric label="source" value={prime?.source_path} />
                        </div>
                    </div>

                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <FileWarning size={13} />
                            Zero Asset
                        </div>
                        <div className="space-y-1">
                            <Metric label="count" value={zero?.count} />
                            <Metric label="stored dps" value={zero?.stored_dps} />
                            <Metric label="required count" value={requiredZero?.count} />
                            <Metric label="required dps" value={requiredZero?.stored_dps} />
                            <Metric label="status" value={assetStatus(sufficiency, "nontrivial_zeta_zeros")} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-3 md:grid-cols-[0.8fr_1.2fr]">
                <div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Current Node</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{next.research_plan.current_node}</div>
                </div>
                <div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Recommended Next Action</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-cyan-100">{next.next_action}</span>
                        {next.target && <code className="rounded bg-blue-950/40 px-1.5 py-0.5 text-[10px] text-blue-200">{next.target}</code>}
                    </div>
                    {next.command && (
                        <code className="mt-2 block break-words rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-zinc-400">
                            {next.command}
                        </code>
                    )}
                </div>
            </div>

            {sufficiency.warnings.length > 0 && (
                <div className="mt-3 flex gap-2 rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-200">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{sufficiency.warnings[0]}</span>
                </div>
            )}
        </section>
    );
}
