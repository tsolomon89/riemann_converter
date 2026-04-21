"use client";

import React from "react";
import { AlertTriangle, Link as LinkIcon } from "lucide-react";
import type { OpenGap } from "../lib/types";

// Renders the open-gaps list from summary.proof_program.open_gaps. Explicitly
// named per PROOF_PROGRAM_SPEC.md §11 so the "not yet shown" claims stop
// living inside implicit app copy.

interface Props {
    openGaps?: OpenGap[];
    id?: string;
}

export default function OpenGapsPanel({ openGaps, id }: Props) {
    if (!openGaps || openGaps.length === 0) return null;

    return (
        <section
            id={id}
            className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-4 space-y-3"
        >
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-amber-300">
                <AlertTriangle size={14} /> Open gaps ({openGaps.length})
                <span className="text-amber-200/70 normal-case text-[9px] italic tracking-normal">
                    claims that have not yet been shown
                </span>
            </div>
            <ul className="space-y-2">
                {openGaps.map((g) => (
                    <li
                        key={g.id}
                        className="rounded border border-amber-500/20 bg-amber-950/30 px-3 py-2"
                    >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[11px] font-bold text-amber-100 truncate">
                                    {g.title}
                                </span>
                                <code className="text-[9px] font-mono text-amber-400/70">
                                    {g.id}
                                </code>
                            </div>
                            {g.blocker_for && g.blocker_for.length > 0 && (
                                <div className="flex items-center gap-1 text-[9px] font-mono text-amber-200/90">
                                    <LinkIcon size={10} /> blocks:
                                    {g.blocker_for.map((b) => (
                                        <code
                                            key={b}
                                            className="px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200"
                                        >
                                            {b}
                                        </code>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="text-[11px] text-amber-100/90 mt-1 leading-relaxed">
                            {g.description}
                        </p>
                    </li>
                ))}
            </ul>
        </section>
    );
}
