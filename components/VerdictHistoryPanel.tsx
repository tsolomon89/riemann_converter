"use client";

import React, { useEffect, useState } from "react";
import { History, ArrowRight, AlertOctagon } from "lucide-react";
import clsx from "clsx";
import type { VerdictHistoryEntry, TheoryStage } from "../lib/types";

const STAGE_ORDER: TheoryStage[] = ["gauge", "lattice", "brittleness", "control"];

const statusColor = (status: string) => {
    switch (status) {
        case "PASS":
            return "text-emerald-300";
        case "FAIL":
            return "text-red-300";
        case "NOTEWORTHY":
            return "text-amber-300";
        case "SKIP":
        case "INCONCLUSIVE":
        case "INSUFFICIENT_DATA":
        case "INSUFFICIENT_SEPARATION":
        case "WARN":
            return "text-amber-200";
        default:
            return "text-gray-400";
    }
};

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

const flipCount = (curr: VerdictHistoryEntry, prev?: VerdictHistoryEntry) => {
    if (!prev) return 0;
    let flips = 0;
    for (const stage of STAGE_ORDER) {
        const a = curr.stage_verdicts?.[stage];
        const b = prev.stage_verdicts?.[stage];
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
                    <span className="uppercase tracking-wider">Verdict History</span>
                </div>
                No <code>verdict_history.jsonl</code> yet. Run <code className="text-gray-300">python verifier.py</code> to create it.
            </div>
        );
    }

    if (entries === null) {
        return (
            <div className="bg-gray-900/30 border border-white/5 rounded-xl p-4 text-[10px] font-mono text-gray-500">
                Loading verdict history...
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="bg-gray-900/30 border border-white/5 rounded-xl p-4 text-[10px] font-mono text-gray-500">
                <div className="flex items-center gap-2 mb-1">
                    <History size={12} />
                    <span className="uppercase tracking-wider">Verdict History</span>
                </div>
                Log file is empty.
            </div>
        );
    }

    // Most recent first, last 10.
    const recent = entries.slice(-10).reverse();

    return (
        <div className="bg-[#070a10] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-gray-400 uppercase">
                    <History size={12} />
                    Verdict History (last {recent.length})
                </div>
                <div className="text-[9px] font-mono text-gray-600">
                    {entries.length} total runs
                </div>
            </div>
            <div className="space-y-1.5">
                {recent.map((entry, idx) => {
                    const prev = recent[idx + 1];
                    const flips = flipCount(entry, prev);
                    return (
                        <div
                            key={entry.timestamp + idx}
                            className={clsx(
                                "grid grid-cols-[140px_1fr_70px] gap-2 items-center text-[10px] font-mono px-2 py-1 rounded border",
                                flips > 0
                                    ? "border-amber-500/30 bg-amber-900/10"
                                    : "border-white/5 hover:bg-white/5"
                            )}
                        >
                            <div className="text-gray-500 truncate" title={entry.timestamp}>
                                {entry.timestamp.replace("T", " ").replace("Z", "")}
                            </div>
                            <div className="flex items-center gap-3">
                                {STAGE_ORDER.map((stage) => {
                                    const curr = entry.stage_verdicts?.[stage] ?? "—";
                                    const prior = prev?.stage_verdicts?.[stage];
                                    const flipped = prior !== undefined && prior !== curr;
                                    return (
                                        <div
                                            key={stage}
                                            className={clsx(
                                                "flex items-center gap-1",
                                                statusColor(curr)
                                            )}
                                            title={
                                                flipped
                                                    ? `${stage}: ${prior} → ${curr}`
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
                            <div
                                className={clsx(
                                    "text-right text-[9px] flex items-center justify-end gap-1",
                                    flips > 0 ? "text-amber-300" : "text-gray-600"
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
