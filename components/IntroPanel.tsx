"use client";

import React, { useState } from "react";
import clsx from "clsx";
import { BookOpen, ChevronDown, ChevronRight, Microscope, ShieldAlert, Compass, Key, Wrench, HelpCircle } from "lucide-react";

// Onboarding intro that centers the research-instrument framing. The sentence
// below is required verbatim by PROOF_PROGRAM_SPEC.md §8.

const FUNCTION_GLOSSARY: Array<{
    label: string;
    icon: React.ReactNode;
    cls: string;
    body: string;
}> = [
    {
        label: "Proof-obligation witness",
        icon: <Key size={12} />,
        cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
        body: "Empirical witness to a stated proof obligation. Only this class (+ CONSISTENT + AUTHORITATIVE) contributes theorem-directed evidence.",
    },
    {
        label: "Coherence witness",
        icon: <Microscope size={12} />,
        cls: "text-blue-300 border-blue-500/30 bg-blue-500/10",
        body: "Shows the reconstruction machinery is internally consistent — \"showing the work\". Not itself evidence for the theorem.",
    },
    {
        label: "Control",
        icon: <ShieldAlert size={12} />,
        cls: "text-pink-300 border-pink-500/30 bg-pink-500/10",
        body: "Must fail on known-bad input. A passing control arms the instrument; it is not evidence for the theory.",
    },
    {
        label: "Pathfinder",
        icon: <Compass size={12} />,
        cls: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
        body: "Selects a research direction. Its answer is directional, not supporting/refuting.",
    },
    {
        label: "Regression check",
        icon: <Wrench size={12} />,
        cls: "text-gray-300 border-white/20 bg-gray-700/30",
        body: "Engine-health plumbing. A failure means a bug, not a theory update.",
    },
    {
        label: "Exploratory",
        icon: <HelpCircle size={12} />,
        cls: "text-purple-300 border-purple-500/30 bg-purple-500/10",
        body: "Role in the proof program not yet decided. Program 2 (contradiction-by-detectability) lives here until formalized.",
    },
];

export default function IntroPanel() {
    const [open, setOpen] = useState(true);

    return (
        <div className="rounded-xl border border-white/10 bg-[#04070d] overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-blue-300">
                    <BookOpen size={14} />
                    How to read this instrument
                </div>
                <span className="text-gray-500">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
            </button>
            {open && (
                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-white/5">
                    <p className="text-sm text-gray-200 leading-relaxed">
                        This is a <strong>proof-program research instrument</strong>, not a
                        theory-verdict dashboard. It investigates whether a nontrivial
                        multiplicative gauge can transport the RH-relevant structure without
                        changing the mathematical case — the full theorem candidate is in
                        the Proof Program Map above.
                    </p>
                    <blockquote className="border-l-2 border-amber-500/50 pl-4 text-sm italic text-amber-100/90">
                        Not every experiment is a verdict on the theory. Some validate
                        implementation, some show the work, some witness proof obligations,
                        and some guide future research.
                    </blockquote>
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                            Experiment function glossary
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {FUNCTION_GLOSSARY.map((f) => (
                                <div
                                    key={f.label}
                                    className={clsx(
                                        "rounded border px-3 py-2 flex items-start gap-2",
                                        f.cls,
                                    )}
                                >
                                    <span className="shrink-0 mt-0.5">{f.icon}</span>
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-bold leading-tight">
                                            {f.label}
                                        </div>
                                        <div className="text-[10px] opacity-80 leading-snug mt-0.5">
                                            {f.body}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="text-[10px] font-mono text-gray-500 italic">
                        Every experiment card below shows an <strong>allowed</strong> and a{" "}
                        <strong>disallowed</strong> conclusion — these travel with the data
                        and are the guardrail against overreach.
                    </div>
                </div>
            )}
        </div>
    );
}
