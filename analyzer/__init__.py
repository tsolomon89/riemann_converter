"""Deterministic analyzer for Riemann research run artifacts.

Reads public/experiments.json + public/verdict_history.jsonl, emits a
Markdown interpretation that distinguishes coherence from controls from
proof-obligation witnesses, firewalls Program 2, and reads the obligation
block as the source of truth for theorem state. No LLM calls.
"""

from analyzer.loader import load_run, load_history
from analyzer.decompose import decompose_run, ExperimentRecord, RunDecomposition
from analyzer.decision_table import evaluate_headline, HeadlineRow, Severity
from analyzer.obligation_diff import obligation_movement, ObligationMovement
from analyzer.render import render_report, Report

__all__ = [
    "load_run",
    "load_history",
    "decompose_run",
    "ExperimentRecord",
    "RunDecomposition",
    "evaluate_headline",
    "HeadlineRow",
    "Severity",
    "obligation_movement",
    "ObligationMovement",
    "render_report",
    "Report",
]
