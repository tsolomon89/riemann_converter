"""I/O for analyzer: load run artifact and history JSONL."""

from __future__ import annotations

import json
import os
from typing import Any

import verifier


def load_run(path: str | None = None) -> dict[str, Any]:
    """Load `public/experiments.json` (or an explicit path)."""
    target = path or verifier.OUTPUT_FILE
    with open(target, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_history(path: str | None = None) -> list[dict[str, Any]]:
    """Load all entries from `public/verdict_history.jsonl` in order.

    Skips blank lines. Returns [] if the file does not exist."""
    target = path or verifier.HISTORY_FILE
    if not os.path.exists(target):
        return []
    entries: list[dict[str, Any]] = []
    with open(target, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            entries.append(json.loads(line))
    return entries
