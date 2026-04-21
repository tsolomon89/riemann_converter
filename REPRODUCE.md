# Reviewer Reproduction Guide

This guide is the reviewer handoff for running and interpreting this repository
under the canonical proof-program semantics.

Read this together with:

- [PROOF_PROGRAM_SPEC.md](PROOF_PROGRAM_SPEC.md) (canonical ontology)
- [THEORY.md](THEORY.md) (theorem candidate + obligations)
- [WITNESS_MAP_REVIEW.md](WITNESS_MAP_REVIEW.md) (provisional witness-map gate)

---

## 1. Scope and claim boundaries

This repository is a research instrument, not a theorem verdict board.

- It does not claim a formal proof of RH.
- It does not claim to extend ordinal zero verification beyond the external
  verification premise used at k=0.
- It does claim to test whether RH-relevant structure is coherent under the
  multiplicative gauge family, with explicit obligations and open gaps.

The canonical Program 1 obligations are:

- `OBL_COORD_RECONSTRUCTION_COVARIANCE`
- `OBL_ZERO_SCALING_EQUIVALENCE`
- `OBL_BETA_INVARIANCE`
- `OBL_EXACT_RH_TRANSPORT` (currently open; blocked by
  `GAP_RH_PREDICATE_TRANSPORT`)

Program 2 (`OBL_ROGUE_DETECTABILITY`) is retained as exploratory and is not on
the current proof-critical path.

No documentation written in this sprint may phrase provisional witness mappings
as settled theorem-directed evidence.

---

## 2. Canonical run path

### Prerequisites

- Python 3.8+ with `mpmath`
- Node.js 18+ with npm

### Authoritative reproduction

```bash
pip install mpmath
python experiment_engine.py --run all
python verifier.py
```

Canonical artifact path: `public/experiments.json`

Canonical history log: `public/verdict_history.jsonl`

### Launch the app

```bash
npm install
npm run dev
```

Open `http://localhost:7000`.

---

## 3. Fidelity tiers

The rerun controls in [`app/api/rerun/route.ts`](app/api/rerun/route.ts) map to
fixed, auditable command shapes:

| Tier | Command | Typical time | Intended use |
|---|---|---|---|
| Re-grade | `python verifier.py` | seconds | Reclassify existing artifact only. |
| Smoke | `python experiment_engine.py --run all --quick` | ~1 min | Fast plumbing/sanity pass; not citable for theorem-directed evidence. |
| Standard | `python experiment_engine.py --run all --zero-count 2000 --dps 40` | ~5 min | Iteration tier; witness-class results remain provisional. |
| Authoritative | `python experiment_engine.py --run all` | 20-40 min | Canonical citation tier for empirical witness outcomes. |
| Overkill | `python experiment_engine.py --run all --zero-source file:agent_context/zeros_100K_three_ten_power_neg_nine.gz --dps 80` | 1h+ | Stress test against high-precision external zero source. |

Fidelity policy summary:

- Smoke forces fidelity-sensitive functions to `INCONCLUSIVE`.
- Standard keeps witness-class outcomes provisional.
- Authoritative is the default citation tier for empirical witness claims.

---

## 4. How to read outputs (canonical semantics)

Evaluate each experiment record on four required dimensions:

1. `function` (what job it does)
2. `outcome` (what happened)
3. `epistemic_level` (what kind of claim it licenses)
4. `inference` rails (`inference_scope`, `allowed_conclusion`,
   `disallowed_conclusion`)

Primary UI reading order:

1. `ProofProgramMap` (theorem candidate -> obligations -> status)
2. `OpenGapsPanel` (named unresolved blockers)
3. Active experiment card + inference rails
4. `VerdictHistoryPanel` (history semantics)

Positive-evidence rule:

- Only `PROOF_OBLIGATION_WITNESS` + `CONSISTENT` at citable fidelity can count
  as theorem-directed evidence.
- Controls, pathfinders, regression checks, and exploratory experiments are
  necessary for research quality, but they are not direct theorem evidence.

Program segmentation:

- Program 1 tabs are canonical and proof-directed.
- Program 2 tabs are exploratory by design and must not be interpreted as
  coequal theorem evidence surfaces.

---

## 5. Reviewer stress checks

Use these to challenge the result quality:

1. Swap zero source:

```bash
python experiment_engine.py --run all --dps 50
python experiment_engine.py --run all --zero-source file:agent_context/zeros_100K_three_ten_power_neg_nine.gz --dps 80
python verifier.py
```

2. Tighten experiment thresholds in relevant `run_exp*.py` modules and rerun at
   Authoritative tier.
3. Widen EXP_8 k-range and inspect whether implementation-health and obligation
   interpretation remain stable.
4. Audit history deltas in `public/verdict_history.jsonl` against
   `code_fingerprint` and `zero_source_info`.
5. Split execution and grading explicitly:

```bash
python experiment_engine.py --run all --no-verify
python verifier.py
```

---

## 6. Known caveats

- Smoke-tier outcomes are intentionally non-citable for theorem-directed claims.
- Standard-tier witness-class outcomes are provisional by policy.
- `OBL_EXACT_RH_TRANSPORT` remains open (`GAP_RH_PREDICATE_TRANSPORT`).
- Program 2 remains exploratory until its non-hiding theorem gap is closed
  (`GAP_PROGRAM2_FORMALIZATION`).
- Witness mapping is still provisional pending the review artifact and signoff
  in [WITNESS_MAP_REVIEW.md](WITNESS_MAP_REVIEW.md).

---

## 7. Legacy appendix (deprecated compatibility context)

This appendix is for historical artifacts and one-release compatibility only.
Do not use these fields as active research semantics.

### 7.1 Deprecated fields

| Legacy field | Status | Canonical replacement |
|---|---|---|
| `theory_fit` | Deprecated compatibility shim | `function` + `outcome` + `inference` |
| `role` | Deprecated compatibility shim | `function` |
| `summary.stage_verdicts` | Deprecated compatibility shim | `summary.proof_program` + `summary.implementation_health` |

### 7.2 Legacy vocabulary mapping

| Legacy term | Canonical reading |
|---|---|
| `SUPPORTS` / `REFUTES` / `CANDIDATE` | Noncanonical legacy rollup language. Use function/outcome/inference rails instead. |
| `INFORMATIVE` | Superseded by pathfinder `function = PATHFINDER` and directional outcomes. |
| `CONTROL_BROKEN` | Superseded by `IMPLEMENTATION_BROKEN` under control/regression semantics. |
| Stage-level verdict flips | Superseded by obligation-state and implementation-health transitions. |

### 7.3 Legacy paths

Older documentation referenced `dashboard/public/...` and
`dashboard/app/api/...`. The canonical paths are:

- `public/experiments.json`
- `public/verdict_history.jsonl`
- `app/api/rerun/route.ts`

