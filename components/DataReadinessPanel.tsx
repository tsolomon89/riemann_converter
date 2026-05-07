"use client";

import React from "react";
import clsx from "clsx";
import {
    CheckCircle2,
    Database,
    FileCheck2,
    FileWarning,
    HardDrive,
    ShieldCheck,
} from "lucide-react";

type ResearchEnvelope<T> = {
    data?: T;
};

type Asset = {
    asset_id?: string;
    kind?: string;
    role?: string;
    source_path?: string | null;
    count?: number | null;
    max_prime?: number | null;
    max_value?: number | string | null;
    stored_dps?: number | null;
    usable_dps?: number | null;
    valid?: boolean;
    validation_status?: string;
    validation_artifact_path?: string;
    reference_asset_id?: string;
    reference_asset_path?: string;
    warnings?: string[];
    errors?: string[];
};

type DataAssetsPayload = {
    summary?: {
        asset_count?: number;
        by_kind?: Record<string, number>;
    };
    manifest?: {
        schema_version?: string;
        canonical_root?: string;
        assets?: Asset[];
    };
    warnings?: string[];
    plain_language_summary?: string;
};

type PreflightPayload = {
    status?: string;
    reason?: string;
    requested_zero_count?: number;
    selected_zero_source?: string;
    zero_validation_status?: string;
    next_action?: string | null;
    selected_assets?: {
        zero?: SelectedAsset;
        tau?: SelectedAsset;
        prime?: SelectedAsset;
        trivial_zeros?: SelectedAsset;
    };
    warnings?: string[];
};

type SelectedAsset = {
    asset?: Asset;
    reason?: string;
    validation?: { status?: string } | null;
    reference_asset?: Asset;
};

type FreshnessPayload = {
    artifact_kind?: string;
    freshness?: string;
    reason?: string;
    latest_run_id?: string | null;
    path?: string | null;
};

type PanelState = {
    dataAssets: ResearchEnvelope<DataAssetsPayload> | null;
    preflight: ResearchEnvelope<PreflightPayload> | null;
    selectedSource: ResearchEnvelope<PreflightPayload> | null;
    certificateFreshness: FreshnessPayload | null;
};

const fetchJson = async <T,>(url: string): Promise<T | null> => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
};

const fmt = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "n/a";
    if (typeof value === "number") return value.toLocaleString();
    return String(value);
};

const assetsByKind = (assets: Asset[], kind: string) =>
    assets.filter((asset) => asset.kind === kind);

const statusTone = (status?: string) => {
    const value = String(status ?? "").toUpperCase();
    if (["READY", "PASS", "CURRENT", "AVAILABLE", "VALID"].includes(value)) {
        return "border-emerald-500/35 bg-emerald-950/25 text-emerald-200";
    }
    if (["STALE", "MISSING_FOR_RUN", "NOT_BUILT", "MISSING", "INSUFFICIENT", "INSUFFICIENT_PRECISION"].includes(value)) {
        return "border-amber-500/35 bg-amber-950/25 text-amber-200";
    }
    if (["FAIL", "FAILED", "BLOCKED", "INVALID"].includes(value)) {
        return "border-rose-500/35 bg-rose-950/25 text-rose-200";
    }
    return "border-zinc-600/40 bg-zinc-900/50 text-zinc-300";
};

function StatusChip({ children, status }: { children: React.ReactNode; status?: string }) {
    return (
        <span className={clsx("rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-tight", statusTone(status))}>
            {children}
        </span>
    );
}

function Metric({ label, value }: { label: string; value: unknown }) {
    return (
        <div className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className="text-zinc-500">{label}</span>
            <code className="max-w-[65%] truncate text-right font-mono text-zinc-300" title={fmt(value)}>
                {fmt(value)}
            </code>
        </div>
    );
}

function AssetCard({ asset }: { asset: Asset }) {
    const status = asset.valid === true ? "VALID" : asset.valid === false ? "INVALID" : "UNKNOWN";
    return (
        <div className="rounded border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold text-zinc-200" title={asset.asset_id}>
                        {asset.asset_id ?? asset.kind ?? "asset"}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] font-mono text-zinc-500" title={asset.source_path ?? undefined}>
                        {asset.source_path ?? "formula / generated"}
                    </div>
                </div>
                <StatusChip status={status}>{status}</StatusChip>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1">
                <Metric label="count" value={asset.count} />
                <Metric label="stored dps" value={asset.stored_dps} />
                <Metric label="usable dps" value={asset.usable_dps} />
                <Metric label="max" value={asset.max_prime ?? asset.max_value} />
                <Metric label="validation" value={asset.validation_status} />
            </div>
            {(asset.reference_asset_id || asset.reference_asset_path) && (
                <div className="mt-2 rounded border border-white/10 bg-zinc-950/40 px-2 py-1 text-[10px] text-zinc-400">
                    reference: <code className="text-zinc-300">{asset.reference_asset_id ?? asset.reference_asset_path}</code>
                </div>
            )}
        </div>
    );
}

function SelectedSourceRow({ label, item }: { label: string; item?: SelectedAsset }) {
    return (
        <div className="grid grid-cols-[90px_1fr_auto] items-center gap-2 border-b border-white/5 py-2 text-[10px] last:border-b-0">
            <span className="font-mono uppercase tracking-wider text-zinc-500">{label}</span>
            <span className="min-w-0 truncate text-zinc-300" title={item?.asset?.source_path ?? item?.asset?.asset_id}>
                {item?.asset?.source_path ?? item?.asset?.asset_id ?? "n/a"}
            </span>
            <StatusChip status={item?.validation?.status ?? (item?.asset?.valid ? "VALID" : undefined)}>
                {item?.validation?.status ?? (item?.asset?.valid ? "valid" : "n/a")}
            </StatusChip>
        </div>
    );
}

export default function DataReadinessPanel({ id }: { id?: string }) {
    const [state, setState] = React.useState<PanelState | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchJson<ResearchEnvelope<DataAssetsPayload>>("/api/research/data-assets"),
            fetchJson<ResearchEnvelope<PreflightPayload>>("/api/research/preflight?preset=overkill"),
            fetchJson<ResearchEnvelope<PreflightPayload>>("/api/research/selected-data-source?preset=overkill"),
            fetchJson<FreshnessPayload>("/api/research/artifact-freshness?artifact_kind=certificate"),
        ])
            .then(([dataAssets, preflight, selectedSource, certificateFreshness]) => {
                if (!cancelled) {
                    setState({ dataAssets, preflight, selectedSource, certificateFreshness });
                }
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

    const dataPayload = state?.dataAssets?.data;
    const assets = dataPayload?.manifest?.assets ?? [];
    const zeroAssets = assetsByKind(assets, "nontrivial_zeta_zeros");
    const primeAssets = assetsByKind(assets, "primes");
    const tauAssets = assetsByKind(assets, "tau");
    const trivialZeroAssets = assetsByKind(assets, "trivial_zeta_zeros");
    const preflight = state?.preflight?.data;
    const selected = state?.selectedSource?.data?.selected_assets ?? preflight?.selected_assets;
    const zeroValidationStatus =
        preflight?.zero_validation_status ??
        selected?.zero?.validation?.status ??
        zeroAssets.find((asset) => asset.validation_status)?.validation_status;
    const validations = zeroAssets
        .filter((asset) => asset.validation_status || asset.reference_asset_id || asset.reference_asset_path || asset.validation_artifact_path)
        .map((asset) => ({
            asset_id: asset.asset_id,
            asset_path: asset.source_path,
            status: asset.validation_status,
            reference_asset_id: asset.reference_asset_id,
            reference_asset_path: asset.reference_asset_path,
            validation_artifact_path: asset.validation_artifact_path,
        }));

    if (loading) {
        return (
            <section id={id} className="rounded-xl border border-white/10 bg-zinc-950/50 p-4">
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                    <Database size={14} />
                    Data
                </div>
                <div className="mt-2 text-[12px] text-zinc-500">Loading data assets and preflight state...</div>
            </section>
        );
    }

    return (
        <section id={id} className="rounded-xl border border-emerald-500/25 bg-emerald-950/10 p-4 space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-emerald-300">
                        <Database size={14} />
                        Data & Preflight
                    </div>
                    <p className="mt-1 max-w-4xl text-[12px] leading-relaxed text-zinc-400">
                        Canonical zeros, primes, tau, validation reports, selected data sources, and certificate freshness.
                        These are run inputs and artifact-fidelity checks, not mathematical verdicts.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusChip status={preflight?.status}>preflight {preflight?.status ?? "n/a"}</StatusChip>
                    <StatusChip status={zeroValidationStatus}>
                        zero validation {zeroValidationStatus ?? "n/a"}
                    </StatusChip>
                    <StatusChip status={state?.certificateFreshness?.freshness}>
                        certificate {state?.certificateFreshness?.freshness ?? "n/a"}
                    </StatusChip>
                </div>
            </header>

            {preflight?.reason && (
                <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-zinc-300">
                    {preflight.reason}
                </div>
            )}

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded border border-white/10 bg-black/20 p-3">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Zero Assets</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-100">{zeroAssets.length}</div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-3">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Prime Assets</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-100">{primeAssets.length}</div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-3">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Tau Assets</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-100">{tauAssets.length}</div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-3">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Total Assets</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-100">{dataPayload?.summary?.asset_count ?? assets.length}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-3">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <HardDrive size={13} />
                            Zero Assets
                        </div>
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                            {zeroAssets.slice(0, 4).map((asset) => <AssetCard key={asset.asset_id ?? asset.source_path ?? asset.kind} asset={asset} />)}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div>
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                                <FileCheck2 size={13} />
                                Prime Assets
                            </div>
                            <div className="space-y-2">
                                {primeAssets.map((asset) => <AssetCard key={asset.asset_id ?? asset.source_path ?? asset.kind} asset={asset} />)}
                            </div>
                        </div>
                        <div>
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                                <ShieldCheck size={13} />
                                Tau / Trivial Zeros
                            </div>
                            <div className="space-y-2">
                                {[...tauAssets, ...trivialZeroAssets].map((asset) => (
                                    <AssetCard key={asset.asset_id ?? asset.source_path ?? asset.kind} asset={asset} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <CheckCircle2 size={13} />
                            Selected Data Source (overkill preflight)
                        </div>
                        <SelectedSourceRow label="zero" item={selected?.zero} />
                        <SelectedSourceRow label="tau" item={selected?.tau} />
                        <SelectedSourceRow label="prime" item={selected?.prime} />
                        <SelectedSourceRow label="trivial" item={selected?.trivial_zeros} />
                        <div className="mt-2 grid grid-cols-1 gap-1">
                            <Metric label="requested zeros" value={preflight?.requested_zero_count} />
                            <Metric label="selected zero source" value={preflight?.selected_zero_source} />
                            <Metric label="next action" value={preflight?.next_action} />
                        </div>
                    </div>

                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <FileWarning size={13} />
                            Zero Validation / Reference Cross-check
                        </div>
                        {validations.length === 0 ? (
                            <div className="text-[11px] text-zinc-500">
                                No zero-validation status is registered in the current manifest or preflight state.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {validations.slice(0, 4).map((validation) => (
                                    <div key={validation.asset_id ?? validation.asset_path} className="rounded border border-white/10 bg-zinc-950/40 p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-[11px] font-mono text-zinc-200" title={validation.asset_id}>
                                                {validation.asset_id ?? validation.asset_path}
                                            </span>
                                            <StatusChip status={validation.status}>{validation.status ?? "n/a"}</StatusChip>
                                        </div>
                                        <div className="mt-1 grid grid-cols-1 gap-1">
                                            <Metric label="reference" value={validation.reference_asset_id ?? validation.reference_asset_path} />
                                            <Metric label="validation artifact" value={validation.validation_artifact_path} />
                                            <Metric label="asset path" value={validation.asset_path} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                            <ShieldCheck size={13} />
                            Artifact Freshness
                        </div>
                        <Metric label="certificate freshness" value={state?.certificateFreshness?.freshness} />
                        <Metric label="latest run" value={state?.certificateFreshness?.latest_run_id} />
                        <Metric label="path" value={state?.certificateFreshness?.path} />
                        <div className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                            {state?.certificateFreshness?.reason ?? "Certificate freshness endpoint unavailable."}
                        </div>
                    </div>
                </div>
            </div>

            {(dataPayload?.warnings?.length ?? 0) > 0 && (
                <div className="rounded border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-100">
                    {dataPayload?.warnings?.[0]}
                </div>
            )}
        </section>
    );
}
