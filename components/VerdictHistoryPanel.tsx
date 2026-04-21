"use client";

import React, { useEffect, useState } from "react";
import { History, ArrowRight, AlertOctagon } from "lucide-react";
import clsx from "clsx";
import type { VerdictHistoryEntry, TheoryStage } from "../lib/types";

const STAGE_ORDER: TheoryStage[] = ["gauge", "lattice", "brittleness", "control"];

const obligationStatusColor = (status: string) => {
    switch (status) {
        case "FORMALLY_PROVEN":
            return "text-blue-300";
        case "WITNESSED":
            return "text-emerald-300";
        case "OPEN":
            return "text-amber-200";
        default:
            return "text-gray-400";
    }
};

const implementationHealthColor = (status: string) => {
    switch (status) {
        case "IMPLEMENTATION_BROKEN":
            return "text-red-300";
        case "IMPLEMENTATION_OK":
            return "text-emerald-300";
        case "MIXED":
            return "text-amber-300";
        case "NO_MEMBERS":
            return "text-gray-500";
        case "INCONCLUSIVE":
            return "text-amber-200";
        default:
            return "text-gray-400";
    }
};

const hasStatuses = (value: Record<string, string> | undefined) =>
    Boolean(value && Object.keys(value).length > 0);

// Lightweight JSONL parser: one JSON object per non-empty line.
const parseJsonl = (text: string): VerdictHistoryEntry[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const entries: VerdictHistoryEntry[] = [];
    for (const line of lines) {
        try {
            entries.push(JSON.parse(line) as VerdictHistoryEntry);
        } catch {
            // Skip malformed lines -- the history log is append-only and may be
            // mid-write during a race. A skipped line is strictly better than
            // a crashed panel.
        }
    }
    return entries;
};

const collectKeys = (
    entries: VerdictHistoryEntry[],
    selector: (entry: VerdictHistoryEntry) => Record<string, string> | undefined,
) => {
    const keys = new Set<string>();
    for (const entry of entries) {
        const map = selector(entry);
        if (!map) continue;
        for (const key of Object.keys(map)) keys.add(key);
    }
    return Array.from(keys);
};

const flipCountForKeys = (
    keys: string[],
    curr: Record<string, string> | undefined,
    prev: Record<string, string> | undefined,
) => {
    if (!curr || !prev) return 0;
    let flips = 0;
    for (const key of keys) {
        const a = curr[key];
        const b = prev[key];
        if (a !== undefined && b !== undefined && a !== b) flips += 1;
    }
    return flips;
};

export default function VerdictHistoryPanel() {
    const [entries, setEntries] = useState<VerdictHistoryEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/verdict_history.jsonl")
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                setEntries(parseJsonl(text));
            })
            .catch((err) => {
                setError(String(err));
            });
    }, []);

    if (error) {
        return (
            <div className="bg-gray-900/30 border border-white/5 rounded-xl p-4 text-[10px] font-mono text-gray-500">
                <div className="flex items-center gap-2 mb-1">
                    <History size={12} />
                    <span className="uppercase tracking-wider">Canonical History</span>
                </div>
                No <code>verdict_history.jsonl</code> yet. Run <code className="text-gray-300">python verifier.py</code> to create it.
            </div>
        );
    }

    if (entries === null) {
        return (
            <div className="bg-gray-900/30 border border-white/5 rounded-xl p-4 text-[10px] font-mono text-gray-500">
                Loading canonical history...
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="bg-gray-900/30 border border-white/5 rounded-xl p-4 text-[10px] font-mono text-gray-500">
                <div className="flex items-center gap-2 mb-1">
                    <History size={12} />
                    <span className="uppercase tracking-wider">Canonical History</span>
                </div>
                Log file is empty.
            </div>
        );
    }

    const canonicalEntries = entries.filter(
        (entry) =>
            hasStatuses(entry.obligation_statuses) ||
            hasStatuses(entry.implementation_health_statuses),
    );

    // Hide panel when history has only deprecated stage-level data.
    if (canonicalEntries.length === 0) return null;

    // Most recent first, last 10 canonical records.
    const recent = canonicalEntries.slice(-10).reverse();
    const obligationKeys = collectKeys(recent, (entry) => entry.obligation_statuses).sort();
    const implementationHealthKeysRaw = collectKeys(
        recent,
        (entry) => entry.implementation_health_statuses,
    );
    const implementationHealthKeys = [
        ...STAGE_ORDER.filter((s) => implementationHealthKeysRaw.includes(s)),
        ...implementationHealthKeysRaw
            .filter((s) => !STAGE_ORDER.includes(s as TheoryStage))
            .sort(),
    ];
    const showObligations = obligationKeys.length > 0;
    const showImplementationHealth = implementationHealthKeys.length > 0;

    // Fallback rule from Sprint 3b plan: implementation-health-only is allowed,
    // but if that is also missing we hide this panel rather than rendering
    // deprecated stage-verdict semantics.
    if (!showImplementationHealth) return null;

    return (
        <div className="bg-[#070a10] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-gray-400 uppercase">
                    <History size={12} />
                    Canonical History (last {recent.length})
                </div>
                <div className="text-[9px] font-mono text-gray-600">
                    {canonicalEntries.length} canonical runs
                </div>
            </div>
            <div className="space-y-1.5">
                {recent.map((entry, idx) => {
                    const prev = recent[idx + 1];
                    const obligationFlips = flipCountForKeys(
                        obligationKeys,
                        entry.obligation_statuses,
                        prev?.obligation_statuses,
                    );
                    const implementationHealthFlips = flipCountForKeys(
                        implementationHealthKeys,
                        entry.implementation_health_statuses,
                        prev?.implementation_health_statuses,
                    );
                    const flips = obligationFlips + implementationHealthFlips;
                    return (
                        <div
                            key={entry.timestamp + idx}
                            className={clsx(
                                "grid grid-cols-[170px_1fr_84px] gap-2 items-center text-[10px] font-mono px-2 py-1 rounded border",
                                flips > 0
                                    ? "border-amber-500/30 bg-amber-900/10"
                                    : "border-white/5 hover:bg-white/5",
                            )}
                        >
                            <div className="text-gray-500 truncate" title={entry.timestamp}>
                                {entry.timestamp.replace("T", " ").replace("Z", "")}
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                                {showObligations && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[9px] uppercase text-gray-600">obligations</span>
                                        {obligationKeys.map((oblId) => {
                                            const curr = entry.obligation_statuses?.[oblId] ?? "-";
                                            const prior = prev?.obligation_statuses?.[oblId];
                                            const flipped = prior !== undefined && prior !== curr;
                                            return (
                                                <div
                                                    key={oblId}
                                                    className={clsx("flex items-center gap-1", obligationStatusColor(curr))}
                                                    title={
                                                        flipped
                                                            ? `${oblId}: ${prior} -> ${curr}`
                                                            : `${oblId}: ${curr}`
                                                    }
                                                >
                                                    <span className="opacity-70 text-[9px] uppercase">
                                                        {oblId.replace(/^OBL_/, "").slice(0, 8)}
                                                    </span>
                                                    {flipped && (
                                                        <>
                                                            <span className="opacity-60 text-[9px]">{prior}</span>
                                                            <ArrowRight size={9} className="opacity-60" />
                                                        </>
                                                    )}
                                                    <span className="font-bold">{curr}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[9px] uppercase text-gray-600">impl health</span>
                                    {implementationHealthKeys.map((stage) => {
                                        const curr = entry.implementation_health_statuses?.[stage] ?? "-";
                                        const prior = prev?.implementation_health_statuses?.[stage];
                                        const flipped = prior !== undefined && prior !== curr;
                                        return (
                                            <div
                                                key={stage}
                                                className={clsx("flex items-center gap-1", implementationHealthColor(curr))}
                                                title={
                                                    flipped
                                                        ? `${stage}: ${prior} -> ${curr}`
                                                        : `${stage}: ${curr}`
                                                }
                                            >
                                                <span className="opacity-70 text-[9px] uppercase">
                                                    {stage.slice(0, 3)}
                                                </span>
                                                {flipped && (
                                                    <>
                                                        <span className="opacity-60 text-[9px]">{prior}</span>
                                                        <ArrowRight size={9} className="opacity-60" />
                                                    </>
                                                )}
                                                <span className="font-bold">{curr}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div
                                className={clsx(
                                    "text-right text-[9px] flex items-center justify-end gap-1",
                                    flips > 0 ? "text-amber-300" : "text-gray-600",
                                )}
                            >
                                {flips > 0 && <AlertOctagon size={10} />}
                                {flips > 0 ? `${flips} flip${flips > 1 ? "s" : ""}` : entry.overall}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
