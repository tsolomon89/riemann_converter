"use client";

import React from "react";
import clsx from "clsx";
import {
    BookMarked,
    Compass,
    FileText,
    GitPullRequestArrow,
    Lightbulb,
    Target,
} from "lucide-react";
import type {
    CandidateLemmaPayload,
    ProofDiscoveryEnvelope,
} from "../lib/proof-discovery-api";
import type {
    ProofDiscoveryIndex,
    ProofDiscoveryLemmaEntry,
} from "../lib/lemma-generator";
import type { BaselineHypothesis } from "../lib/hypothesis-registry";

type ProofDiscoveryPayload = {
    run_id: string | null;
    index: ProofDiscoveryIndex | null;
    markdown: string | null;
};

type BaselineListPayload = {
    baselines: BaselineHypothesis[];
    coverage: { covered: boolean; missing: string[]; total: number };
};

type ProposalListPayload = {
    run_id: string | null;
    proposals: Array<{ proposal_id: string; experiment_id: string; status: string; reason?: string }>;
};

type CandidateListPayload = {
    run_id: string | null;
    lemmas: CandidateLemmaPayload[];
};

type PanelState = {
    proofDiscovery: ProofDiscoveryEnvelope<ProofDiscoveryPayload> | null;
    baselines: ProofDiscoveryEnvelope<BaselineListPayload> | null;
    proposals: ProofDiscoveryEnvelope<ProposalListPayload> | null;
    candidates: ProofDiscoveryEnvelope<CandidateListPayload> | null;
};

const fetchJson = async <T,>(url: string): Promise<T | null> => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
};

const labelFor = (entry: { display_id?: string; experiment_id?: string }) =>
    entry.display_id ?? entry.experiment_id ?? "experiment";

function StatusChip({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "emerald" | "amber" | "cyan" | "rose" | "violet" }) {
    const tones: Record<typeof tone, string> = {
        zinc: "border-zinc-600/40 bg-zinc-900/50 text-zinc-300",
        emerald: "border-emerald-500/35 bg-emerald-950/25 text-emerald-200",
        amber: "border-amber-500/35 bg-amber-950/25 text-amber-200",
        cyan: "border-cyan-500/35 bg-cyan-950/25 text-cyan-200",
        rose: "border-rose-500/35 bg-rose-950/25 text-rose-200",
        violet: "border-violet-500/35 bg-violet-950/25 text-violet-200",
    };
    return (
        <span className={clsx("rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-tight", tones[tone])}>
            {children}
        </span>
    );
}

function OpenExperimentButton({
    entry,
    onOpenExperiment,
}: {
    entry: { display_id?: string; experiment_id?: string };
    onOpenExperiment?: (experimentId: string) => void;
}) {
    if (!entry.experiment_id || !onOpenExperiment) {
        return <span className="font-mono text-zinc-300">{labelFor(entry)}</span>;
    }
    return (
        <button
            type="button"
            onClick={() => onOpenExperiment(entry.experiment_id!)}
            className="font-mono text-cyan-200 underline-offset-2 hover:text-cyan-100 hover:underline"
        >
            {labelFor(entry)}
        </button>
    );
}

function LemmaList({
    title,
    items,
    onOpenExperiment,
}: {
    title: string;
    items: ProofDiscoveryLemmaEntry[];
    onOpenExperiment?: (experimentId: string) => void;
}) {
    return (
        <div className="rounded border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                {title}
            </div>
            {items.length === 0 ? (
                <div className="text-[11px] text-zinc-500">No entries generated for this run.</div>
            ) : (
                <div className="space-y-2">
                    {items.slice(0, 6).map((entry, idx) => (
                        <div key={`${entry.experiment_id}-${idx}`} className="space-y-1 border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <OpenExperimentButton entry={entry} onOpenExperiment={onOpenExperiment} />
                                <StatusChip tone={entry.baseline_status === "CONFIRMED" ? "emerald" : entry.baseline_status === "FAILED" ? "rose" : "amber"}>
                                    {entry.baseline_status}
                                </StatusChip>
                                <StatusChip tone="violet">{entry.scoped_consequence}</StatusChip>
                            </div>
                            {entry.lemma_name && (
                                <div className="text-[11px] text-zinc-200">{entry.lemma_name}</div>
                            )}
                            {entry.statement && (
                                <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400">{entry.statement}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ProofDiscoveryIndexPanel({
    id,
    onOpenExperiment,
}: {
    id?: string;
    onOpenExperiment?: (experimentId: string) => void;
}) {
    const [state, setState] = React.useState<PanelState | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchJson<ProofDiscoveryEnvelope<ProofDiscoveryPayload>>("/api/research/proof-discovery"),
            fetchJson<ProofDiscoveryEnvelope<BaselineListPayload>>("/api/research/baseline-hypotheses"),
            fetchJson<ProofDiscoveryEnvelope<ProposalListPayload>>("/api/research/hypothesis-proposals?status=PROPOSED"),
            fetchJson<ProofDiscoveryEnvelope<CandidateListPayload>>("/api/research/candidate-lemmas"),
        ])
            .then(([proofDiscovery, baselines, proposals, candidates]) => {
                if (!cancelled) setState({ proofDiscovery, baselines, proposals, candidates });
            })
            .catch(() => {
                if (!cancelled) setState(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const envelope = state?.proofDiscovery;
    const index = envelope?.data?.index ?? null;
    const baselines = state?.baselines?.data;
    const proposals = state?.proposals?.data?.proposals ?? [];
    const candidates = state?.candidates?.data?.lemmas ?? [];

    if (loading) {
        return (
            <section id={id} className="rounded-xl border border-white/10 bg-zinc-950/50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                    <BookMarked size={14} />
                    Proof Discovery
                </div>
                <div className="mt-2 text-[12px] text-zinc-500">Loading proof-discovery index...</div>
            </section>
        );
    }

    return (
        <section id={id} className="rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-4 space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-cyan-300">
                        <BookMarked size={14} />
                        Proof Discovery
                    </div>
                    <p className="mt-1 max-w-4xl text-[12px] leading-relaxed text-zinc-400">
                        Experiment reviews separate baseline, raw observation, model comparison, candidate lemma,
                        scoped consequence, and remaining proof obligation. This panel is the index into those review artifacts.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusChip tone={index?.coverage.coverage_complete ? "emerald" : "amber"}>
                        {index?.coverage.coverage_complete ? "coverage complete" : "coverage partial"}
                    </StatusChip>
                    <StatusChip tone="cyan">run {envelope?.run_id ?? "unresolved"}</StatusChip>
                </div>
            </header>

            {!index ? (
                <div className="rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-100">
                    {envelope?.plain_language_summary ?? "No proof-discovery index is available for the current run."}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Reviews</div>
                            <div className="mt-1 text-lg font-semibold text-zinc-100">{index.totals.experiments_reviewed}</div>
                        </div>
                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Failed/Incomp.</div>
                            <div className="mt-1 text-lg font-semibold text-amber-100">{index.totals.failed_or_incomplete}</div>
                        </div>
                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Formal Targets</div>
                            <div className="mt-1 text-lg font-semibold text-cyan-100">{index.formalization_targets.length}</div>
                        </div>
                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Baselines</div>
                            <div className="mt-1 text-lg font-semibold text-violet-100">{baselines?.baselines.length ?? 0}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <LemmaList
                            title="Program 1 candidate lemmas"
                            items={index.program_1_candidate_lemmas}
                            onOpenExperiment={onOpenExperiment}
                        />
                        <LemmaList
                            title="Controls and instrument lemmas"
                            items={index.controls_and_instrument_lemmas}
                            onOpenExperiment={onOpenExperiment}
                        />
                        <LemmaList
                            title="Pathfinding notes"
                            items={index.pathfinding_notes}
                            onOpenExperiment={onOpenExperiment}
                        />
                        <LemmaList
                            title="Program 2 contradiction track"
                            items={index.program_2_contradiction_track_lemmas}
                            onOpenExperiment={onOpenExperiment}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_0.9fr]">
                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                                <Target size={13} />
                                Formalization Targets
                            </div>
                            <div className="space-y-2">
                                {index.formalization_targets.slice(0, 6).map((target) => (
                                    <div key={`${target.experiment_id}-${target.candidate_lemma_name ?? target.scope}`} className="text-[11px] leading-snug">
                                        <OpenExperimentButton entry={target} onOpenExperiment={onOpenExperiment} />
                                        <span className="text-zinc-500"> -&gt; </span>
                                        <span className="text-zinc-300">{target.candidate_lemma_name ?? target.scope}</span>
                                    </div>
                                ))}
                                {index.formalization_targets.length === 0 && (
                                    <div className="text-[11px] text-zinc-500">No formalization targets generated.</div>
                                )}
                            </div>
                        </div>

                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                                <Compass size={13} />
                                Failed Baselines / Revised Hypotheses
                            </div>
                            <div className="space-y-2">
                                {index.failed_or_incomplete_baselines.slice(0, 5).map((entry) => (
                                    <div key={entry.experiment_id} className="space-y-1 text-[11px]">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <OpenExperimentButton entry={entry} onOpenExperiment={onOpenExperiment} />
                                            <StatusChip tone="amber">{entry.baseline_status}</StatusChip>
                                            <StatusChip tone="violet">{entry.scoped_consequence}</StatusChip>
                                        </div>
                                        {entry.actual_run_inference[0] && (
                                            <div className="text-zinc-400">{entry.actual_run_inference[0]}</div>
                                        )}
                                    </div>
                                ))}
                                {index.failed_or_incomplete_baselines.length === 0 && (
                                    <div className="text-[11px] text-zinc-500">No failed or incomplete baselines in the current index.</div>
                                )}
                            </div>
                        </div>

                        <div className="rounded border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                                <GitPullRequestArrow size={13} />
                                Baseline Proposals
                            </div>
                            <div className="space-y-2 text-[11px]">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Registered baselines</span>
                                    <span className="font-mono text-zinc-200">{baselines?.baselines.length ?? 0}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Coverage</span>
                                    <span className={clsx("font-mono", baselines?.coverage.covered ? "text-emerald-300" : "text-amber-300")}>
                                        {baselines?.coverage.covered ? "covered" : "missing"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-500">Proposed revisions</span>
                                    <span className="font-mono text-zinc-200">{proposals.length}</span>
                                </div>
                                {proposals.slice(0, 3).map((proposal) => (
                                    <div key={proposal.proposal_id} className="rounded border border-white/10 bg-zinc-950/40 px-2 py-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono text-cyan-200">{proposal.experiment_id}</span>
                                            <StatusChip tone="amber">{proposal.status}</StatusChip>
                                        </div>
                                        {proposal.reason && <div className="mt-1 text-zinc-500">{proposal.reason}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <Lightbulb size={13} />
                            Candidate Lemma Coverage
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {candidates.slice(0, 14).map((candidate) => (
                                <button
                                    key={candidate.experiment_id}
                                    type="button"
                                    onClick={() => onOpenExperiment?.(candidate.experiment_id)}
                                    className="rounded border border-white/10 bg-zinc-950/50 px-2 py-1 text-[10px] font-mono text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-100"
                                >
                                    {candidate.display_id}: {candidate.candidate_lemmas.length}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            <div className="flex items-start gap-2 rounded border border-blue-500/20 bg-blue-950/20 px-3 py-2 text-[11px] leading-relaxed text-blue-100/90">
                <FileText size={13} className="mt-0.5 shrink-0" />
                The index is a routing surface for human proof work. It does not turn a run into a theorem verdict.
            </div>
        </section>
    );
}
