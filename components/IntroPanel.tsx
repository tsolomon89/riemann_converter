"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";
import {
    BookOpen,
    ChevronDown,
    ChevronRight,
    Microscope,
    ShieldAlert,
    Compass,
    Key,
    Wrench,
    HelpCircle,
} from "lucide-react";

// Onboarding intro that centers the research-instrument framing. The sentence
// below is required verbatim by PROOF_PROGRAM_SPEC.md section 8.

const FUNCTION_GLOSSARY: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    cls: string;
    body: string;
}> = [
    {
        id: "proof-obligation-witness",
        label: "Proof-obligation witness",
        icon: <Key size={12} />,
        cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
        body: "Empirical witness to a stated proof obligation. Only this class (+ CONSISTENT + AUTHORITATIVE) contributes theorem-directed evidence.",
    },
    {
        id: "coherence-witness",
        label: "Coherence witness",
        icon: <Microscope size={12} />,
        cls: "text-blue-300 border-blue-500/30 bg-blue-500/10",
        body: "Shows the reconstruction machinery is internally consistent - showing the work. Not itself evidence for the theorem.",
    },
    {
        id: "control",
        label: "Control",
        icon: <ShieldAlert size={12} />,
        cls: "text-pink-300 border-pink-500/30 bg-pink-500/10",
        body: "Must fail on known-bad input. A passing control arms the instrument; it is not evidence for the theory.",
    },
    {
        id: "pathfinder",
        label: "Pathfinder",
        icon: <Compass size={12} />,
        cls: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
        body: "Selects a research direction. Its answer is directional, not supporting/refuting.",
    },
    {
        id: "regression-check",
        label: "Regression check",
        icon: <Wrench size={12} />,
        cls: "text-gray-300 border-white/20 bg-gray-700/30",
        body: "Engine-health plumbing. A failure means a bug, not a theory update.",
    },
    {
        id: "exploratory",
        label: "Contradiction Track",
        icon: <HelpCircle size={12} />,
        cls: "text-purple-300 border-purple-500/30 bg-purple-500/10",
        body: "Program 2 formalizes contradiction-by-detectability: rogue detectability, no-hiding under compression, and closure. Until those formal gaps close, it is informational only.",
    },
];

type ProgramDocSection = {
    id: string;
    title: string;
    source_file: string;
    source_heading: string;
    markdown: string;
    updated_at: string;
};

type ProgramDocsResponse = {
    data?: {
        sections?: ProgramDocSection[];
    };
};

const renderInlineMarkdown = (value: string, keyPrefix: string) => {
    const parts = value
        .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
        .map((part) => part.trim())
        .filter(Boolean);

    return parts.map((part, idx) => {
        const key = `${keyPrefix}-inline-${idx}`;
        if (part.startsWith("`") && part.endsWith("`")) {
            return (
                <code key={key} className="px-1 py-0.5 rounded bg-black/40 text-blue-100 text-[11px]">
                    {part.slice(1, -1)}
                </code>
            );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={key}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={key}>{part} </React.Fragment>;
    });
};

const renderMarkdownBlocks = (markdown: string, keyPrefix: string) => {
    const lines = markdown.split(/\r?\n/);
    const blocks: React.ReactNode[] = [];
    let paragraph: string[] = [];
    let bullets: string[] = [];
    let blockIdx = 0;

    const nextKey = () => `${keyPrefix}-block-${blockIdx++}`;
    const flushParagraph = () => {
        if (paragraph.length === 0) return;
        const text = paragraph.join(" ").trim();
        if (!text) {
            paragraph = [];
            return;
        }
        blocks.push(
            <p key={nextKey()} className="text-[12px] text-gray-200 leading-relaxed">
                {renderInlineMarkdown(text, `${keyPrefix}-p-${blockIdx}`)}
            </p>,
        );
        paragraph = [];
    };
    const flushBullets = () => {
        if (bullets.length === 0) return;
        blocks.push(
            <ul key={nextKey()} className="list-disc pl-5 space-y-1 text-[12px] text-gray-200/95 leading-relaxed">
                {bullets.map((bullet, idx) => (
                    <li key={`${keyPrefix}-li-${idx}`}>
                        {renderInlineMarkdown(bullet, `${keyPrefix}-li-${idx}`)}
                    </li>
                ))}
            </ul>,
        );
        bullets = [];
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (line.length === 0) {
            flushParagraph();
            flushBullets();
            continue;
        }

        const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            flushBullets();
            blocks.push(
                <div key={nextKey()} className="text-[11px] uppercase tracking-widest font-mono text-blue-200/90">
                    {renderInlineMarkdown(headingMatch[1], `${keyPrefix}-heading-${blockIdx}`)}
                </div>,
            );
            continue;
        }

        const quoteMatch = line.match(/^>\s+(.+)$/);
        if (quoteMatch) {
            flushParagraph();
            flushBullets();
            blocks.push(
                <blockquote
                    key={nextKey()}
                    className="border-l-2 border-amber-500/40 pl-3 italic text-[12px] text-amber-100/90"
                >
                    {renderInlineMarkdown(quoteMatch[1], `${keyPrefix}-quote-${blockIdx}`)}
                </blockquote>,
            );
            continue;
        }

        const bulletMatch = line.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
            flushParagraph();
            bullets.push(bulletMatch[1]);
            continue;
        }

        paragraph.push(line);
    }

    flushParagraph();
    flushBullets();
    return blocks;
};

export default function IntroPanel() {
    const [open, setOpen] = useState(true);
    const [docSections, setDocSections] = useState<ProgramDocSection[]>([]);
    const [docsLoading, setDocsLoading] = useState(true);
    const [docsError, setDocsError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadDocs = async () => {
            try {
                setDocsLoading(true);
                setDocsError(null);
                const res = await fetch("/api/research/program-docs", { cache: "no-store" });
                if (!res.ok) {
                    throw new Error(`docs fetch failed (${res.status})`);
                }
                const payload = (await res.json()) as ProgramDocsResponse;
                const sections = Array.isArray(payload?.data?.sections) ? payload.data.sections : [];
                if (!cancelled) setDocSections(sections);
            } catch (err) {
                if (!cancelled) {
                    setDocsError(err instanceof Error ? err.message : "docs fetch failed");
                }
            } finally {
                if (!cancelled) setDocsLoading(false);
            }
        };

        loadDocs();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section id="intro-panel" className="ui-intro-panel rounded-xl border border-white/10 bg-[#04070d] overflow-hidden">
            <button
                id="intro-panel-toggle"
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="intro-panel-content"
                className="ui-intro-panel-toggle w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
                <div id="intro-panel-title" className="ui-intro-panel-title flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-blue-300">
                    <BookOpen size={14} />
                    How to read this instrument
                </div>
                <span id="intro-panel-chevron" className="ui-intro-panel-chevron text-gray-500">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
            </button>
            {open && (
                <div
                    id="intro-panel-content"
                    className="ui-intro-panel-content px-5 pb-5 pt-1 space-y-4 border-t border-white/5"
                >
                    <p id="intro-panel-summary" className="ui-intro-panel-summary text-sm text-gray-200 leading-relaxed">
                        Riemann Converter is a <strong>research instrument</strong>. The theorem
                        target and obligation ladder live in the Proof Program panel above; the
                        role glossary below explains what each experiment&apos;s function label means
                        and what it does not claim.
                    </p>
                    <div
                        id="intro-doc-sync-section"
                        className="ui-intro-doc-sync-section rounded-lg border border-white/10 bg-[#0b1220]/50 px-4 py-3 space-y-3"
                    >
                        <div
                            id="intro-doc-sync-label"
                            className="text-[10px] font-mono uppercase tracking-widest text-blue-300/80"
                        >
                            Documentation-synced context (README + project alignment)
                        </div>
                        {docsLoading && (
                            <div id="intro-doc-sync-loading" className="text-[12px] text-gray-400">
                                Loading documentation sections...
                            </div>
                        )}
                        {!docsLoading && docsError && (
                            <div id="intro-doc-sync-error" className="text-[12px] text-rose-300">
                                Unable to load docs context: {docsError}
                            </div>
                        )}
                        {!docsLoading && !docsError && docSections.length === 0 && (
                            <div id="intro-doc-sync-empty" className="text-[12px] text-gray-400">
                                No synced doc sections found.
                            </div>
                        )}
                        {!docsLoading &&
                            !docsError &&
                            docSections.map((section) => (
                                <article
                                    key={section.id}
                                    id={`intro-doc-section-${section.id}`}
                                    className="ui-intro-doc-section rounded border border-white/10 bg-black/20 p-3 space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-[11px] font-semibold text-blue-100">{section.title}</div>
                                        <div className="text-[10px] font-mono text-gray-500">
                                            {section.updated_at.slice(0, 16).replace("T", " ")} UTC
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-mono text-gray-500">
                                        source: <code>{section.source_file}</code> - <code>{section.source_heading}</code>
                                    </div>
                                    <div className="space-y-2">
                                        {renderMarkdownBlocks(section.markdown, `doc-${section.id}`)}
                                    </div>
                                </article>
                            ))}
                    </div>
                    <details id="intro-function-glossary" className="ui-intro-glossary">
                        <summary className="text-[10px] font-mono uppercase tracking-widest text-gray-500 cursor-pointer hover:text-gray-300 py-1">
                            Experiment function glossary ({FUNCTION_GLOSSARY.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                            <div
                                id="intro-function-glossary-grid"
                                className="ui-intro-glossary-grid grid grid-cols-1 md:grid-cols-2 gap-2"
                            >
                                {FUNCTION_GLOSSARY.map((f) => (
                                    <div
                                        key={f.label}
                                        id={`intro-glossary-item-${f.id}`}
                                        className={clsx(
                                            "ui-intro-glossary-item rounded border px-3 py-2 flex items-start gap-2",
                                            f.cls,
                                        )}
                                    >
                                        <span className="ui-intro-glossary-item-icon shrink-0 mt-0.5">{f.icon}</span>
                                        <div className="min-w-0">
                                            <div className="ui-intro-glossary-item-title text-[11px] font-bold leading-tight">
                                                {f.label}
                                            </div>
                                            <div className="ui-intro-glossary-item-body text-[10px] opacity-80 leading-snug mt-0.5">
                                                {f.body}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div
                                id="intro-panel-guardrail-note"
                                className="ui-intro-panel-guardrail-note text-[10px] font-mono text-gray-500 italic"
                            >
                                Every experiment card below shows an <strong>allowed</strong> and a{" "}
                                <strong>disallowed</strong> conclusion - these travel with the data
                                and are the guardrail against overreach.
                            </div>
                        </div>
                    </details>
                </div>
            )}
        </section>
    );
}
