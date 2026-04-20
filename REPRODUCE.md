# Reviewer Reproduction Guide

Read this if you are about to evaluate this repository's claims. It explains
what the project does and does not claim, how to rerun the evidence at
varying fidelity, how to read the dashboard, and — most importantly — how
to stress-test the conclusions yourself.

---

## 1. The Claim (and the Non-Claim)

**This repository does not re-verify RH for the first 10¹³ zeros — Odlyzko
and Platt–Trudgian already did that.** It tests whether that verification
*extends to other scales* via gauge/lattice structure, without
recomputation. If the structure is rigid, the external verification
propagates to every scale of the coordinate gauge for free. This project
empirically stress-tests the rigidity. For the precise claim statement,
see [THEORY.md](THEORY.md).

The evidence is organized around a brittleness hero and two scaffolding
stages:

> **Brittleness (the evidentiary hero).** If any zero were off the
> critical line within the covered ordinate range, the rogue-zero
> detection battery (EXP_2 / EXP_2B / EXP_7) would amplify it to
> detectability under deep-zoom scaling. We run the detectors. We see
> nothing. That is the falsifiable content.
>
> **Gauge (scaffolding).** Coordinate scaling $X \to X/\tau^k$ is
> covariant with the explicit formula; naive operator scaling of zeros
> is not. The gauge is rigid. (EXP_1 witnesses, EXP_1B falsifies.)
>
> **Lattice (scaffolding).** Zeros of $\zeta(s \cdot \tau^k)$ are exactly
> the $\tau^{-k}$-scaled zeros of $\zeta$. This is a variable
> substitution — EXP_8 is a plumbing check that our engine respects the
> identity, not an independent empirical claim. $\beta$-stability
> (EXP_6) is the load-bearing follow-up: if $\hat\beta(k) \equiv ½$,
> known zeros at $k=0$ extend to all $k$.

The **non-claim** is equally load-bearing:

> **This is not a proof of RH.** No formal derivation; no Lean artifact.
> This is a falsifiability exercise: if the conjecture is wrong *in the
> covered regime*, the experiments should detect it. A full slate of
> `SUPPORTS` verdicts at the `Authoritative` tier means the theory
> survived the specific falsification attempts encoded by this repo
> over the tested range — nothing stronger. It does not extend RH beyond
> Odlyzko's verified ordinate range.

If you came expecting a proof, stop here. If you came to poke holes in an
empirical argument, continue.

### 1.1 Positioning vs prior work

This repo sits on top of, and explicitly relies on:

- **Odlyzko's numerical verification** of ζ's non-trivial zeros on the
  critical line for the first ~10¹³ zeros. We consume his 100k-zero
  high-precision file (see Overkill tier below) as a trusted external
  witness at $k=0$.
- **Platt–Trudgian** on RH-up-to-height bounds, which define the
  ordinate range our external premise covers.

What this repo *adds*: a structural test — are Claims 1–4 of
[THEORY.md](THEORY.md) consistent with the numerical record? If yes,
the external verification buys more than it bought as standalone
numerical coverage: it buys the whole equivariance class indexed by $k$.
What this repo *assumes*: Odlyzko's verification at $k=0$ is correct.
That is the load-bearing external premise; if it is wrong, nothing here
is salvageable.

---

## 2. How to Run

### Prerequisites

- Python 3.8+ with `mpmath` (`pip install mpmath`)
- Node.js 18+ and npm (for the dashboard)

### The Five Re-run Tiers

The dashboard exposes five hardcoded fidelity tiers. Each maps to a shell
command that you can run directly — no free-text CLI passthrough exists
in the UI (by design: the argv lists are auditable in
[dashboard/app/api/rerun/route.ts](dashboard/app/api/rerun/route.ts)).

| Tier | Command | Wall time | Purpose |
|---|---|---|---|
| **Re-grade** | `python verifier.py` | seconds | Re-grade the existing artifact against the current verifier rules. No recompute. |
| **Smoke** | `python experiment_engine.py --run all --quick` | ~1 min | 100 zeros, dps=30. Plumbing check only. Verifier clamps `ENABLER`/`DETECTOR` theory verdicts to `INCONCLUSIVE` at this tier (declared fidelity floor — see §8). **Never cite as theory evidence.** |
| **Standard** | `python experiment_engine.py --run all --zero-count 2000 --dps 40` | ~5 min | Default fidelity for iterative development. `ENABLER` verdicts emit `provisional: true`; still not reviewer-citable. |
| **Authoritative** | `python experiment_engine.py --run all` | 20–40 min | 20k generated zeros, dps=50. **This is the evidence run.** Clamps lift entirely — all `REFUTES`/`SUPPORTS` verdicts cited in reviewer conversations should come from this tier or Overkill. |
| **Overkill** | `python experiment_engine.py --run all --zero-source file:agent_context/zeros_100K_three_ten_power_neg_nine.gz --dps 80` | 1h+ | Odlyzko 100k zeros, dps=80. Stress-test against a high-precision external source. |

After running the engine, grade with `python verifier.py`. (The engine
auto-grades at the end by default; pass `--no-verify` to skip inline
grading and invoke `verifier.py` as a separate step — recommended for
reviewer-reproducible runs.)

### Launching the Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000. The five-button rerun bar in the top header
lets you trigger any of the tiers above without dropping to a shell.

---

## 3. How to Read the Dashboard (30-second tour)

### StageBanner (top of the page)

Four colored cards, left to right: **Gauge**, **Lattice**, **Brittleness**,
**Control**. The visual order follows the logical dependency chain, but
**Brittleness is the card that carries the evidentiary weight** — Gauge
and Lattice are scaffolding that sets up the equivalence class,
Brittleness is the falsifiable content. Control is the meta-check that
our detectors are armed. Read Brittleness first when scanning for
whether the theory survived; read Gauge/Lattice to check the scaffolding
held.

Each card shows a stage-level status rolled up from its member
experiments:

- **Green `SUPPORTS`** — every member experiment in this stage contributed
  a `SUPPORTS` theory_fit. The stage is consistent with the conjecture.
- **Red `REFUTES`** — at least one `ENABLER` member returned `REFUTES`.
  The stage has at least one counter-example.
- **Red `CONTROL_BROKEN`** — a `FALSIFICATION_CONTROL` member failed to
  diverge on known-bad data. The system's ability to detect bad theory is
  compromised; all other verdicts should be distrusted.
- **Amber `CANDIDATE` / `PARTIAL`** — mixed decisive outcomes (some
  SUPPORTS, some REFUTES) or at least one PATHFINDER returned INFORMATIVE
  without any REFUTES.
- **Gray/amber `INCONCLUSIVE`** — insufficient data or no decisive member
  outcomes yet.

Each card also shows a **role breakdown** chip row (glyphs for ENABLER,
PATHFINDER, DETECTOR, FALSIFICATION_CONTROL) summarizing the role mix
within that stage.

### Per-Experiment Rows (sidebar)

Each row shows:

- **Experiment id** (EXP_1, EXP_1B, etc.) and short title
- **Stage badge** (Gauge / Lattice / Brittleness / Control)
- **Role glyph** — the role of this experiment in the evidence chain:
  - **Key (🔑)** — `ENABLER`: establishes a premise. A REFUTES here breaks the chain.
  - **Compass (🧭)** — `PATHFINDER`: disambiguates mechanism. Decisive outcomes are `INFORMATIVE`, not SUPPORTS/REFUTES.
  - **Radar** — `DETECTOR`: verifies rogue-zero detection works.
  - **Shield** — `FALSIFICATION_CONTROL`: sanity check — must diverge on known-bad data.
- **theory_fit badge** — the theory-centric verdict (see §4 below).

### PATHFINDER "direction" metric

PATHFINDER experiments (EXP_4, EXP_5) emit a `direction` field alongside
their verdict. Example: EXP_4 returns
`direction: "TRANSLATION"` or `direction: "DILATION"` based on which model
wins the RMSE race. The main-panel verdict badge for a PATHFINDER reads
e.g. "Pathfinder → TRANSLATION" — that's the *informative* output, not a
pass/fail signal.

---

## 4. Verdict Vocabulary

Two orthogonal axes grade each experiment. Both are visible in the
`summary.experiments[EXP_ID]` block of `dashboard/public/experiments.json`.

### `theory_fit` (the theory-centric axis)

| Value | Meaning |
|---|---|
| `SUPPORTS` | Decisive outcome consistent with the conjecture. |
| `REFUTES` | Decisive outcome inconsistent with the conjecture (for ENABLER / DETECTOR). |
| `CANDIDATE` | Noteworthy signal that does not yet reach the SUPPORTS threshold. |
| `INFORMATIVE` | A PATHFINDER emitted a decisive direction; does not pass or fail the theory — it tells you which mechanism won. |
| `CONTROL_BROKEN` | A FALSIFICATION_CONTROL failed to diverge. The system cannot detect a known-bad input; trust in all other verdicts is degraded. |
| `INCONCLUSIVE` | Insufficient data / insufficient separation / skipped. |

### `role` (the chain-function axis)

| Value | Meaning |
|---|---|
| `ENABLER` | PASS establishes a premise in the gauge → lattice → brittleness chain. A REFUTES here invalidates the chain. |
| `PATHFINDER` | Disambiguates a mechanism between candidates. Any decisive outcome is `INFORMATIVE`; its job is to select a path, not to grade the theory. |
| `DETECTOR` | Verifies the rogue-zero detection machinery works. |
| `FALSIFICATION_CONTROL` | Sanity check: must diverge on known-bad data. A PASS (falsifier triggered) maps to `SUPPORTS`; a FAIL maps to `CONTROL_BROKEN`. |

### Why two axes?

A mechanical `FAIL` does not always mean "theory refuted." EXP_3
(β = π falsifier) is *supposed* to FAIL — that's how we know the detector
is armed. Conversely, EXP_4 (translation-vs-dilation) is not trying to
prove anything; it's picking a branch. The `theory_fit` axis translates
mechanical outcomes into theory-centric semantics using the `role` axis.

---

## 5. What a `SUPPORTS` Verdict Does NOT Mean

> `SUPPORTS` at `Authoritative` fidelity means the experiment's numeric
> tolerance was met under the stated theory interpretation.
>
> It **does not** constitute a proof of RH. It **does not** extend the
> verdict to unrun regimes (higher zeros, deeper zoom, larger k). It
> **does not** imply the theory's informal arguments (e.g., "trillion
> primes in a tiny real-line interval at τ⁻⁹⁹") are formally established.

A reviewer who reads a green StageBanner and concludes "they proved RH"
has misread this tool. The tool says: *we tried to falsify the conjecture
in specific numerical regimes and failed*. That is a falsifiability
result, not a theorem.

### 5.1 Role declarations are up-front, not post-hoc

A reasonable skeptic reading EXP_1B ("mechanical FAIL maps to theory
`SUPPORTS`") will suspect inversion after the fact. That suspicion is
worth addressing explicitly.

Every experiment's role is declared in a single dict:
[verifier.py:ROLE_MAP](verifier.py) (lines 48–60). EXP_1B's role is
`FALSIFICATION_CONTROL`, meaning "must diverge on known-bad data." The
semantic that a `FAIL` of a `FALSIFICATION_CONTROL` diverging on a
known-wrong scaling *supports* the claim "our gauge is rigid" is encoded
in the role axis itself, not invented per-result. Git history is the
audit: `git blame verifier.py` on the `ROLE_MAP` dict shows when each
role was assigned, and in particular that EXP_1B's role was set when the
experiment was added — not after its numerical outcome was observed.

If you find a case where `ROLE_MAP` appears to have been retrofitted to
an observed outcome, that is a legitimate attack on the repo's integrity
and we want to hear about it.

---

## 6. How to Argue With This

Concrete knobs a skeptic should tweak. Each one is a legitimate line of
attack — if any of these flip the verdict, the theory is weaker than
claimed.

### 6.1 Swap the zero source

Run `Overkill` mode. If verdicts flip between generated-cache zeros and
Odlyzko's 100k high-precision zeros, something in the engine's zero
generation is tilting the result:

```bash
# Generated cache (default)
python experiment_engine.py --run all --dps 50

# Odlyzko 100k
python experiment_engine.py --run all \
  --zero-source file:agent_context/zeros_100K_three_ten_power_neg_nine.gz \
  --dps 80
```

### 6.2 Tighten thresholds

Several experiments have tolerance thresholds that should be sharpened if
the signal is as strong as claimed:

- **EXP_1C drift threshold** — currently permissive. Halve it and re-run.
- **EXP_6 β-drift threshold** — the linchpin ENABLER. How much does β̂
  deviate from 0.5 across scales? Drop the threshold to 0.01 and see.

Edit the threshold in the corresponding `run_exp*.py` file, re-run the
engine at Authoritative fidelity, and check whether the verdict holds.

### 6.3 Widen EXP_8 k-range

EXP_8 (scaled-zeta zero equivalence) defaults to a narrow k-range. Widen
it and check that equivalence still holds far from k=0:

```bash
python experiment_engine.py --run 8 --k-values -4,-3,-2,-1,0,1,2,3,4
```

### 6.4 Audit the regression trail

Every successful grading appends a record to
[dashboard/public/verdict_history.jsonl](dashboard/public/verdict_history.jsonl)
with the code fingerprint (md5 of every `.py` in the engine) and the zero
source metadata. This file is append-only; stage flips emit a
`[REGRESSION]` warning at grading time.

If someone claims "the verdicts have been stable for weeks," that claim
is verifiable from this file alone. It is the audit log.

### 6.5 Verify the verifier is not bypassed

The engine accepts `--no-verify` to skip inline grading — that is the
recommended mode for reviewer reproduction, because it decouples the
experiment run from the grader. Run both steps explicitly:

```bash
python experiment_engine.py --run all --no-verify
python verifier.py
```

Any `[REGRESSION]` warning or schema mismatch will surface in the second
step and block a clean `overall: PASS`.

---

## 7. The Regression Trail

`dashboard/public/verdict_history.jsonl` is the project's audit log. Each
line is a JSON record with:

- `timestamp` (ISO 8601, UTC)
- `schema_version` (current: `2026.05.0`)
- `fidelity_tier` (`SMOKE` / `STANDARD` / `AUTHORITATIVE`)
- `overall` (`PASS` / `FAIL`)
- `stage_verdicts` — `{gauge, lattice, brittleness, control}` → stage-level fit
- `code_fingerprint` — md5 of every engine Python file
- `zero_source_info` — source path, requested/loaded counts, monotonicity flags, validation status

The file is append-only. Every verdict in the dashboard is traceable back
to a specific code fingerprint and zero source. If a stage flips between
runs, the verifier logs a `[REGRESSION]` warning referencing the prior
timestamp.

---

## 8. Known Calibration Issues (honest list)

These are real caveats. A reviewer should know about them before judging
a verdict:

- **Fidelity floor: SMOKE tier clamps ENABLER/DETECTOR verdicts to
  `INCONCLUSIVE`.** The verifier computes a `fidelity_tier`
  (`SMOKE` / `STANDARD` / `AUTHORITATIVE`) from `meta.zeros` and
  `meta.dps` and refuses to grade `ENABLER` or `DETECTOR` experiments at
  `SMOKE` — `theory_fit` is forced to `INCONCLUSIVE` regardless of the
  mechanical outcome. This is a *declared floor*, not explained-away
  noise: at 100 zeros the β-optimizer in EXP_6 returns β̂ ≈ 0.43, which
  is an optimizer discretization artifact rather than a gauge failure,
  and citing a SMOKE `REFUTES` would be a category error. At `STANDARD`
  tier, `ENABLER` verdicts are retained but marked `provisional: true`;
  `AUTHORITATIVE` is the only citable tier. `FALSIFICATION_CONTROL` and
  `PATHFINDER` are unaffected — the former explodes at any N, the latter
  is a relative comparison whose noise cancels. Reviewers: **do not cite
  SMOKE verdicts, and treat STANDARD ENABLER results as preliminary.**
- **EXP_5 requires enough zeros in-range per k.** At k=2 in smoke mode it
  routinely hits `INSUFFICIENT_DATA`.
- **EXP_4 PATHFINDER requires ≥ 5% RMSE separation** between the
  translation and dilation models to emit a decisive direction; below
  that threshold the verdict is `INCONCLUSIVE`, not `INFORMATIVE`.
- **Generated zeros vs Odlyzko zeros** may differ in the 30th+ decimal
  place at high ordinates. This matters at dps ≥ 80 and is the reason
  Overkill mode exists.
- **The StageBanner is a summary, not a proof object.** It rolls up
  member verdicts using rules encoded in `verifier.py`; those rules are
  themselves a judgment call and should be read there, not trusted
  blindly.

---

## 9. Pointers

- **Math specification**: [MATH_README.md](MATH_README.md) — the formal
  statement of the theory chain, explicit-formula derivation, and
  per-experiment math.
- **Dashboard / UI**: [dashboard/README.md](dashboard/README.md) — the
  Zero-Math-in-the-Browser policy and UI architecture.
- **Engine CLI**: [experiment_engine.py](experiment_engine.py) — the
  authoritative list of CLI flags (`--help` for the full menu).
- **Verifier**: [verifier.py](verifier.py) — the grading logic, including
  the role map, theory_fit mapping, and stage rollup rules.
- **Quick-start / overview**: [README.md](README.md).
