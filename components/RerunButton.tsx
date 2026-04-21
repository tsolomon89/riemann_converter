"use client";

import React, { useState } from "react";
import { RefreshCw, Wind, Gauge, Play, Rocket, X } from "lucide-react";
import clsx from "clsx";

// Five re-run tiers the dashboard exposes. Each button maps to a hardcoded
// argv list on the server; see app/api/rerun/route.ts.
//
//   verify        - re-grade existing artifact (seconds)
//   smoke         - plumbing check; ~1 min; DO NOT cite as evidence
//   standard      - iterative-dev fidelity; ~5 min; still not reviewer-grade
//   authoritative - the evidence run; 20-40 min; cite this one
//   overkill      - Odlyzko 100k zeros @ dps=80; 1h+; stress test
type Mode = "verify" | "smoke" | "standard" | "authoritative" | "overkill";

interface Props {
    onFinished?: () => void;
}

const MODE_ORDER: Mode[] = ["verify", "smoke", "standard", "authoritative", "overkill"];

const MODE_LABELS: Record<Mode, { label: string; icon: React.ReactNode; hint: string }> = {
    verify: {
        label: "Re-grade",
        icon: <RefreshCw size={12} />,
        hint: "Re-run verifier.py only against existing artifact (seconds). No recompute.",
    },
    smoke: {
        label: "Smoke",
        icon: <Wind size={12} />,
        hint: "100 zeros, dps=30 (~1 min). Plumbing check � expect noisy INCONCLUSIVE / INCONSISTENT outcomes; DO NOT cite as evidence.",
    },
    standard: {
        label: "Standard",
        icon: <Gauge size={12} />,
        hint: "2000 zeros, dps=40 (~5 min). Iterative-dev fidelity; reasonable signal but not reviewer-grade.",
    },
    authoritative: {
        label: "Authoritative",
        icon: <Play size={12} />,
        hint: "20k zeros, dps=50 (20-40 min). THE evidence run — cite these verdicts.",
    },
    overkill: {
        label: "Overkill",
        icon: <Rocket size={12} />,
        hint: "Odlyzko 100k zeros, dps=80 (1h+). Stress test against high-precision external source.",
    },
};

export default function RerunButton({ onFinished }: Props) {
    const [running, setRunning] = useState<Mode | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [logsOpen, setLogsOpen] = useState(false);
    const runAuthToken = process.env.NEXT_PUBLIC_RESEARCH_RUN_TOKEN?.trim();

    const runMode = async (mode: Mode) => {
        if (running) return;
        setRunning(mode);
        setLogs([`[ui] starting ${mode}...\n`]);
        setLogsOpen(true);
        try {
            const headers: HeadersInit = { "Content-Type": "application/json" };
            if (runAuthToken) headers.Authorization = `Bearer ${runAuthToken}`;
            const response = await fetch("/api/rerun", {
                method: "POST",
                headers,
                body: JSON.stringify({ mode }),
            });
            if (response.status === 409) {
                const body = await response.json();
                setLogs((prev) => [...prev, `[ui] ${body.error ?? "already running"}\n`]);
                return;
            }
            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                setLogs((prev) => [
                    ...prev,
                    `[ui] request failed (${response.status}): ${body.error ?? "run request failed"}\n`,
                ]);
                return;
            }
            const reader = response.body?.getReader();
            if (!reader) {
                setLogs((prev) => [...prev, "[ui] no stream body\n"]);
                return;
            }
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                setLogs((prev) => [...prev, text]);
            }
            setLogs((prev) => [...prev, "[ui] stream closed\n"]);
            onFinished?.();
        } catch (err) {
            setLogs((prev) => [...prev, `[ui] ERROR: ${err}\n`]);
        } finally {
            setRunning(null);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
                {MODE_ORDER.map((mode) => {
                    const meta = MODE_LABELS[mode];
                    const isActive = running === mode;
                    const disabled = running !== null && !isActive;
                    return (
                        <button
                            key={mode}
                            onClick={() => runMode(mode)}
                            disabled={disabled}
                            title={meta.hint}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition-all",
                                isActive
                                    ? "bg-blue-900/40 border-blue-500/50 text-blue-200"
                                    : disabled
                                    ? "bg-gray-900/40 border-white/5 text-gray-600 cursor-not-allowed"
                                    : "bg-gray-900/40 border-white/10 text-gray-300 hover:border-blue-500/40 hover:text-blue-200"
                            )}
                        >
                            <span className={clsx(isActive && "animate-spin")}>{meta.icon}</span>
                            {isActive ? `${meta.label}…` : meta.label}
                        </button>
                    );
                })}
            </div>

            {logsOpen && logs.length > 0 && (
                <div className="bg-black/60 border border-white/10 rounded-md p-3 max-h-48 overflow-y-auto text-[10px] font-mono text-gray-300 relative">
                    <button
                        onClick={() => setLogsOpen(false)}
                        className="absolute top-1 right-1 text-gray-500 hover:text-gray-200"
                        title="Hide log panel"
                    >
                        <X size={12} />
                    </button>
                    <pre className="whitespace-pre-wrap">{logs.join("")}</pre>
                </div>
            )}
        </div>
    );
}
