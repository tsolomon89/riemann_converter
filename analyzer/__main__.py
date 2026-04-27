"""CLI for the analyzer.

Usage:
    python -m analyzer                  # write reports/run-<ts>.md + reports/latest.md
    python -m analyzer --stdout         # print Markdown to stdout
    python -m analyzer --check          # exit code reflects severity
    python -m analyzer --run PATH       # alternate experiments.json
    python -m analyzer --history PATH   # alternate verdict_history.jsonl
    python -m analyzer --out PATH       # write to a specific file
"""

from __future__ import annotations

import argparse
import os
import re
import sys

from analyzer.decision_table import Severity, evaluate_headline
from analyzer.decompose import attach_history_timestamp, decompose_run
from analyzer.loader import load_history, load_run
from analyzer.obligation_diff import obligation_movement
from analyzer.render import Report, render_report


SEVERITY_EXIT_CODE = {
    Severity.STATUS_QUO: 0,
    Severity.POSITIVE: 0,
    Severity.NON_DECISIVE_NEGATIVE: 1,
    Severity.UNKNOWN: 1,
    Severity.DECISIVE_NEGATIVE: 2,
    Severity.BLOCKING: 2,
}


def _safe_filename(ts: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]", "_", ts)


def _reconfigure_stdout_utf8() -> None:
    """Windows defaults to cp1252; reports include Unicode (arrows, emoji)."""
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def main(argv: list[str] | None = None) -> int:
    _reconfigure_stdout_utf8()
    parser = argparse.ArgumentParser(
        prog="python -m analyzer",
        description="Deterministic analyzer for Riemann research run artifacts.",
    )
    parser.add_argument("--run", help="Path to experiments.json (defaults to public/experiments.json)")
    parser.add_argument("--history", help="Path to verdict_history.jsonl (defaults to public/verdict_history.jsonl)")
    parser.add_argument("--out", help="Write the Markdown report to this path instead of reports/run-<ts>.md")
    parser.add_argument("--stdout", action="store_true", help="Print Markdown to stdout; do not write files")
    parser.add_argument("--check", action="store_true", help="Exit code reflects severity (0=ok, 1=non-decisive, 2=blocking/decisive)")
    args = parser.parse_args(argv)

    run_data = load_run(args.run)
    history = load_history(args.history)

    decomposition = attach_history_timestamp(decompose_run(run_data, history), history)
    movement = obligation_movement(history)
    headline = evaluate_headline(decomposition, movement)
    report = Report(run=decomposition, movement=movement, headline=headline)

    markdown = render_report(report)

    if args.stdout:
        sys.stdout.write(markdown)
        if not markdown.endswith("\n"):
            sys.stdout.write("\n")
    else:
        os.makedirs("reports", exist_ok=True)
        ts_part = _safe_filename(decomposition.timestamp or "unknown")
        out_path = args.out or os.path.join("reports", f"run-{ts_part}.md")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(markdown)
        if not args.out:
            with open(os.path.join("reports", "latest.md"), "w", encoding="utf-8") as fh:
                fh.write(markdown)
        print(f"wrote {out_path}", file=sys.stderr)
        if not args.out:
            print("wrote reports/latest.md", file=sys.stderr)

    if args.check:
        return SEVERITY_EXIT_CODE.get(headline.severity, 1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
