# Analyzer + MCP-Fallback Follow-ups

Captured at end of 2026-04-25 session, after landing:
- `analyzer/` package (deterministic Markdown interpreter for run artifacts)
- `mcp-bridge.mjs` local-fs fallback for read-only tools
- 17 Python tests, 8 Jest tests, all green

This file lists what's incomplete, where the design has gaps, and where next-step investigations would pay off. Tiered by urgency.

---

## P0 — Real risks in what shipped

### 1. `analyzer/render.py` has no test coverage
The renderer is exercised end-to-end (`reports/latest.md` was produced and eyeballed) but no automated test asserts that the output contains the expected sections, banners, or rule headline. A small golden-snapshot test against a frozen fixture would catch regressions.

**Action:** Add `tests/test_analyzer_render_golden.py`. Fixture: a synthetic run that hits Rule 4 (matches the current state). Compare rendered Markdown against `tests/fixtures/analyzer/golden/run-rule4.md`. Keep the golden file small (one of each section) and human-reviewable.

### 2. `reports/` directory has no commit policy
`reports/latest.md` and `reports/run-<ts>.md` are written every analyzer invocation. Currently neither gitignored nor explicitly committed. Without a policy: every contributor's local run produces a noisy diff.

**Action:** Pick one:
- **(recommended)** Add `reports/run-*.md` to `.gitignore`; commit only `reports/latest.md` so the most recent honest interpretation lives with the repo.
- Gitignore the whole directory; treat reports as ephemeral.
- Always commit; accept the diff churn.

### 3. pytest is not installed in the project's Python env
[tests/test_proof_program.py](tests/test_proof_program.py) uses pytest fixtures and `patch.object`, but `python -m pytest` fails with `No module named pytest`. Either there's a CI environment with pytest that I didn't see, or the existing pytest tests are broken locally. The new analyzer tests use plain `assert` (so they ran via a bare harness), but this papered over the underlying issue.

**Action:** Add a `requirements-dev.txt` with `pytest>=7` (and any other dev tools) so contributors can run `pip install -r requirements-dev.txt && pytest tests/`. Verify the existing `test_proof_program.py` still passes once installed.

### 4. Live MCP not verified in this session
The bridge patch is verified by:
- direct subprocess invocation showing the fallback envelope ([mcp-bridge.mjs](mcp-bridge.mjs))
- the Jest test suite ([__tests__/mcp-bridge-fallback.test.ts](__tests__/mcp-bridge-fallback.test.ts))

But Claude Code's MCP server process was spawned at session start with the un-patched binary, so in-session MCP calls still return "completed with no output." A new session will pick up the fix.

**Action:** On next session opening, run any of `mcp__riemann-research__get_history` / `get_obligation` / `get_experiment` to confirm the fallback (or HTTP path) responds. If it still no-ops, check that `node ./mcp-bridge.mjs < <(echo '{...}')` produces output — if yes, the issue is the MCP transport layer, not the bridge.

---

## P1 — Obvious extensions that fit the spirit of the change

### 5. Cross-run trajectories
The user's original intuition was "the data tells a different story." The analyzer currently inspects one run plus an obligation-movement counter. It does not chart per-experiment metric trajectories across history. The single most valuable trajectory is **EXP_6's β̂ across all 23 runs**, which would show whether 0.5700 is stable across fidelity tiers or noisy at low N.

**Action:** Add `analyzer/trajectories.py`. Walk `verdict_history.jsonl`, but the history file does NOT carry per-experiment metrics — it only carries stage-level verdicts. So this requires either:
- (a) extending the history schema to include EXP_6's β̂ (touches `verifier.py`)
- (b) reading every prior `experiments.json` snapshot, which the project doesn't archive
- (c) starting now: append a "metric checkpoint" line to history each run going forward

Recommend (c) as low-risk; fixed-cost, future-only.

### 6. Code-fingerprint sanity check
The latest `verdict_history.jsonl` line's `code_fingerprint` should match `experiments.json`'s `meta.code_fingerprint`. If they diverge, the artifact is stale (or the history was appended without re-running the engine).

**Action:** In `analyzer/decompose.py`, add a `consistency_check` that compares the two fingerprints and surfaces a warning section when they diverge.

### 7. Hook the analyzer into the verify pipeline
Currently a manual step. Two integration points:
- **Tail of `verifier.py`**: after writing `experiments.json`, invoke the analyzer in `--check` mode and print the headline rule + severity. This puts the deterministic interpretation right next to the legacy verdict so users see both.
- **`package.json` script**: `"analyze": "python -m analyzer"` so the README can reference it cleanly.

**Action:** Add the npm script. Adding the verifier tail is more invasive — propose separately.

### 8. Documentation
[README.md](README.md), [MCP_README.md](MCP_README.md), and [PROOF_PROGRAM_SPEC.md](PROOF_PROGRAM_SPEC.md) don't mention the analyzer or the bridge fallback.

**Action:** A 3-line addition to README under a "Run analysis" heading; one paragraph in MCP_README explaining the local-fs fallback (so users know read-only tools work without `npm run dev`).

---

## P2 — Design observations the analysis surfaced

### 9. "0 obligation movements across 23 runs" merits its own write-up — DONE
**Status:** Authored as [obligation_movement_analysis.md](obligation_movement_analysis.md).

Correction to an earlier claim made in this file: signing off the witness map does NOT "immediately refute" `OBL_BETA_INVARIANCE`. The verifier's status ladder ([verifier.py:681-789](../verifier.py)) has no `REFUTED` state — only PROVEN / WITNESSED / BLOCKED / CONJECTURAL. An INCONSISTENT witness outcome causes the WITNESSED branch to not fire; the obligation falls through to BLOCKED (because its prereqs still aren't WITNESSED). The real risk at sign-off is a different one: the analyzer's headline rule escalates from Rule 4 (NON_DECISIVE_NEGATIVE) to Rule 3 (DECISIVE_NEGATIVE) while the obligation block doesn't move — a fresh presentation gap. See the linked doc for the full analysis and the recommended pre-signoff actions (resolve EXP_1/EXP_1C promotion question, investigate EXP_6 N-stability).

### 10. EXP_6's β̂ ≈ 0.57: finite-N artifact or real signal?
[verifier.py:73-89](verifier.py) explicitly notes that "EXP_6's beta optimizer stabilizes at ~0.43 when N=100." At N=20000 the value is 0.57. If β̂ depends meaningfully on N, the AUTHORITATIVE-tier "INCONSISTENT" verdict could still be a sample-size artifact — and the threshold of 0.005 may be too tight for a quantity that hasn't been shown to be N-stable.

**Action:** Run EXP_6 at multiple N values within the AUTHORITATIVE tier (e.g., 10K, 20K, 50K, 100K) and chart β̂(N). If β̂ continues to drift with N, the threshold needs revisiting before the witness map can be signed off. If β̂ stabilizes at 0.57, the negative signal is real.

### 11. `theory_fit` deprecation cleanup
Per [verifier.py:956-959](verifier.py), the legacy `theory_fit` field stays through one release and is scheduled for Sprint 2b removal. The analyzer doesn't read `theory_fit` (it uses the canonical `outcome` axis), so it should be unaffected. But re-validate after the cleanup lands.

**Action:** Add a regression test that asserts the analyzer's output is byte-identical when `theory_fit` is present vs. absent in the artifact.

---

## P3 — Bridge fallback completeness

### 12. `get_series`, `compare_scales`, `compare_runs`, `compare_verdicts` are gated behind HTTP
These are conceptually read-only but I classified them as `RUN_CONTROL_TOOLS` because the fallback would need to implement series downsampling, cross-scale comparison, etc. Currently they fail with the "needs npm run dev" message even though they don't actually need run controls.

**Action:** Either (a) implement them as Python sidecar calls (the analyzer already does the heavy lifting that `compare_runs` would need), or (b) re-classify them as read-only and reimplement the envelope shapes in JS. (a) is cleaner — expose `analyze_run`, `compare_runs`, `series_for` as MCP tools that shell out to `python -m analyzer …`.

### 13. Bridge fallback edge cases
Tested: HTTP up, HTTP down + read-only, HTTP down + run-control, unknown tool. Untested: malformed `experiments.json`, missing `experiments.json`, malformed JSONL line, partial truncation.

**Action:** Add fixture-based tests for each malformed-input case. The existing `tryFallback` already wraps fallback execution in try/catch and emits an `isError` text envelope, so the surface area is small.

### 14. Stale-artifact detection in the bridge fallback
If `experiments.json` is days old but the user thinks they're getting fresh data, the banner `[mcp-bridge fallback: HTTP endpoint unreachable; served from local public/* artifacts]` doesn't say *when* the artifact was written.

**Action:** Include the file mtime in the fallback banner: `[...; artifact written 2026-04-24 17:51 UTC]`. Cheap, very useful.

---

## What is explicitly OUT of scope for these follow-ups

- Modifying experiment thresholds in [verifier.py](verifier.py).
- Touching the dashboard ([app/](app/), [components/](components/), [lib/](lib/)).
- Promoting EXP_6 to "decisive" (depends on witness-map review sign-off, see P2 #9).
- LLM-based analysis. The whole point was a deterministic analyzer.

---

## Suggested ordering

If you can only do one thing: **#9** (obligation movement analysis). It's the highest-value insight the analyzer surfaced, and it feeds directly into whether/when to sign off the witness map review, which gates everything downstream.

If you can do three: **#9**, **#1** (render test), **#3** (pytest in dev deps).

If a full afternoon: P0 + P1 in order. P2/P3 then become easier because the test infrastructure and docs are in place.
