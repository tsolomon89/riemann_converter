"use client";

import React from "react";
import {
    Shield,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Clock,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import type { SameObjectCertificate, SectionResult } from "../lib/same-object-certificate";

interface Props {
    certificate?: SameObjectCertificate | null;
    id?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    SAME_OBJECT_CANDIDATE: {
        label: "Same-Object Candidate",
        color: "text-emerald-300",
        bg: "bg-emerald-900/20",
        border: "border-emerald-500/30",
        icon: <Shield size={16} className="text-emerald-400" />,
    },
    SAME_OBJECT_FAILED: {
        label: "Same-Object Failed",
        color: "text-red-300",
        bg: "bg-red-900/20",
        border: "border-red-500/30",
        icon: <XCircle size={16} className="text-red-400" />,
    },
    INCONCLUSIVE: {
        label: "Inconclusive",
        color: "text-amber-300",
        bg: "bg-amber-900/20",
        border: "border-amber-500/30",
        icon: <AlertCircle size={16} className="text-amber-400" />,
    },
    NOT_READY: {
        label: "Not Ready",
        color: "text-zinc-400",
        bg: "bg-zinc-800/40",
        border: "border-zinc-600/30",
        icon: <Clock size={16} className="text-zinc-500" />,
    },
    FORMAL_PROOF_REQUIRED: {
        label: "Formal Proof Required",
        color: "text-blue-300",
        bg: "bg-blue-900/20",
        border: "border-blue-500/30",
        icon: <AlertCircle size={16} className="text-blue-400" />,
    },
};

function SectionBadge({ result }: { result: SectionResult }) {
    if (result === "PASS") return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
    if (result === "FAIL") return <XCircle size={14} className="text-red-400 shrink-0" />;
    if (result === "INCONCLUSIVE") return <AlertCircle size={14} className="text-amber-400 shrink-0" />;
    return <Clock size={14} className="text-zinc-500 shrink-0" />;
}

function SectionRow({
    label,
    result,
    source,
    children,
}: {
    label: string;
    result: SectionResult;
    source?: string;
    children?: React.ReactNode;
}) {
    const [open, setOpen] = React.useState(false);
    const hasChildren = !!children;

    return (
        <div className="rounded border border-zinc-700/40 bg-zinc-800/30">
            <button
                type="button"
                onClick={() => hasChildren && setOpen(!open)}
                className={`flex items-center justify-between w-full px-3 py-2 text-left ${hasChildren ? "cursor-pointer hover:bg-zinc-700/20" : "cursor-default"}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <SectionBadge result={result} />
                    <span className="text-[11px] font-semibold text-zinc-200">{label}</span>
                    {source && (
                        <code className="text-[9px] font-mono text-zinc-500">{source}</code>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            result === "PASS"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : result === "FAIL"
                                  ? "bg-red-500/15 text-red-300"
                                  : result === "INCONCLUSIVE"
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-zinc-600/15 text-zinc-400"
                        }`}
                    >
                        {result}
                    </span>
                    {hasChildren &&
                        (open ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-500" />)}
                </div>
            </button>
            {open && children && (
                <div className="px-3 pb-2 text-[10px] text-zinc-400 space-y-1 border-t border-zinc-700/30 pt-2">
                    {children}
                </div>
            )}
        </div>
    );
}

function MetricLine({ label, value }: { label: string; value: unknown }) {
    if (value === null || value === undefined) return null;
    const formatted =
        typeof value === "number"
            ? value < 0.001 && value > 0
                ? value.toExponential(3)
                : value.toFixed(6)
            : String(value);
    return (
        <div className="flex items-baseline justify-between gap-2">
            <span className="text-zinc-500">{label}</span>
            <code className="text-zinc-300 font-mono">{formatted}</code>
        </div>
    );
}

export default function SameObjectCertificatePanel({ certificate, id }: Props) {
    if (!certificate) return null;

    const cfg = STATUS_CONFIG[certificate.status] ?? STATUS_CONFIG.NOT_READY;

    return (
        <section
            id={id}
            className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-4`}
        >
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    {cfg.icon}
                    <span className={`text-[11px] font-mono uppercase tracking-widest ${cfg.color}`}>
                        Same-Object Certificate
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                    <code className="text-[9px] font-mono text-zinc-500">
                        {certificate.certificate_id}
                    </code>
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Primary object: <code className="text-zinc-300">{certificate.object_under_test.primary}</code>
                    {" · "}
                    Gauge: <code className="text-zinc-300">{certificate.gauge.map}</code>
                    {" · "}
                    k tested: <code className="text-zinc-300">{certificate.gauge.k_values_tested.join(", ")}</code>
                </p>
            </div>

            {/* Core sections */}
            <div className="space-y-1.5">
                <SectionRow
                    label="Reconstruction Agreement"
                    result={certificate.reconstruction_agreement.result}
                    source={certificate.reconstruction_agreement.display_id}
                >
                    <p className="text-zinc-400 mb-1">{certificate.reconstruction_agreement.note}</p>
                    <MetricLine label="Harmonic drift vs k=0" value={certificate.reconstruction_agreement.metrics.max_harmonic_drift_vs_k0} />
                    <MetricLine label="Möbius drift vs k=0" value={certificate.reconstruction_agreement.metrics.max_mobius_drift_vs_k0} />
                    <MetricLine label="Truth drift vs k=0" value={certificate.reconstruction_agreement.metrics.max_y_true_drift_vs_k0} />
                    <MetricLine label="Stress max error" value={certificate.reconstruction_agreement.metrics.stress_max_abs_truth_error} />
                </SectionRow>

                <SectionRow
                    label="Zero Correspondence"
                    result={certificate.zero_handling.result}
                    source={certificate.zero_handling.display_id}
                >
                    <p className="text-zinc-400 mb-1">{certificate.zero_handling.note}</p>
                    <MetricLine label="p99 |Δ|" value={certificate.zero_handling.metrics.p99_abs_dev} />
                    <MetricLine label="p95 residual" value={certificate.zero_handling.metrics.p95_residual} />
                    <MetricLine label="Max |Δ|" value={certificate.zero_handling.metrics.max_abs_dev} />
                    <MetricLine label="Successes" value={certificate.zero_handling.metrics.count_success} />
                    <MetricLine label="Failures" value={certificate.zero_handling.metrics.count_fail} />
                </SectionRow>

                <SectionRow
                    label="Predicate Preservation"
                    result={certificate.predicate_preservation.result}
                    source={certificate.predicate_preservation.display_id}
                >
                    <p className="text-zinc-400 mb-1">{certificate.predicate_preservation.note}</p>
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-zinc-500">Critical line preserved:</span>
                        <span className={
                            certificate.predicate_preservation.critical_line_preserved === "YES"
                                ? "text-emerald-300 font-bold"
                                : certificate.predicate_preservation.critical_line_preserved === "NO"
                                  ? "text-red-300 font-bold"
                                  : "text-amber-300"
                        }>
                            {certificate.predicate_preservation.critical_line_preserved}
                        </span>
                    </div>
                    {certificate.predicate_preservation.metrics.beta_hat_by_k &&
                        Object.entries(certificate.predicate_preservation.metrics.beta_hat_by_k).map(([k, v]) => (
                            <MetricLine key={k} label={`β̂(k=${k})`} value={v} />
                        ))}
                    <MetricLine label="Max β drift" value={certificate.predicate_preservation.metrics.max_beta_drift} />
                </SectionRow>

                {/* Controls */}
                <SectionRow
                    label="Controls"
                    result={
                        certificate.controls.wrong_operator_scaling_fails.result === "PASS" &&
                        certificate.controls.wrong_beta_fails.result === "PASS"
                            ? "PASS"
                            : certificate.controls.wrong_operator_scaling_fails.result === "FAIL" ||
                              certificate.controls.wrong_beta_fails.result === "FAIL"
                              ? "FAIL"
                              : "INCONCLUSIVE"
                    }
                    source="CTRL-1 / CTRL-2"
                >
                    <div className="flex items-center gap-2">
                        <SectionBadge result={certificate.controls.wrong_operator_scaling_fails.result} />
                        <span>Wrong operator scaling fails</span>
                        <code className="text-zinc-500">({certificate.controls.wrong_operator_scaling_fails.source})</code>
                    </div>
                    <div className="flex items-center gap-2">
                        <SectionBadge result={certificate.controls.wrong_beta_fails.result} />
                        <span>Wrong β fails</span>
                        <code className="text-zinc-500">({certificate.controls.wrong_beta_fails.source})</code>
                    </div>
                </SectionRow>

                {/* Counterexample visibility — informational */}
                <SectionRow
                    label="Counterexample Visibility"
                    result={certificate.counterexample_visibility.result}
                    source="P2 exploratory"
                >
                    <p className="text-zinc-500 italic">{certificate.counterexample_visibility.note}</p>
                </SectionRow>
            </div>

            {/* Remaining formal step */}
            <div className="rounded border border-blue-500/20 bg-blue-900/10 px-3 py-2 space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-widest text-blue-300">
                    Remaining Formal Step
                </div>
                <p className="text-[11px] text-blue-100 font-semibold">
                    {certificate.remaining_formal_step.lemma_needed}
                </p>
                <p className="text-[10px] text-blue-200/70 leading-relaxed">
                    {certificate.remaining_formal_step.description}
                </p>
                <code className="text-[9px] font-mono text-blue-400/60">
                    {certificate.remaining_formal_step.gap_id}
                </code>
            </div>

            {/* Conclusions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded border border-emerald-500/15 bg-emerald-950/20 px-3 py-2">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-400/70 mb-1">
                        Allowed
                    </div>
                    {certificate.allowed_conclusion.map((c, i) => (
                        <p key={i} className="text-[10px] text-emerald-200/80 leading-relaxed">{c}</p>
                    ))}
                </div>
                <div className="rounded border border-red-500/15 bg-red-950/20 px-3 py-2">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-red-400/70 mb-1">
                        Not Allowed
                    </div>
                    {certificate.disallowed_conclusion.map((c, i) => (
                        <p key={i} className="text-[10px] text-red-200/60 leading-relaxed">{c}</p>
                    ))}
                </div>
            </div>

            {/* Scope note */}
            <p className="text-[9px] text-zinc-500 italic leading-relaxed">
                {certificate.object_under_test.scope_note}
            </p>
        </section>
    );
}
