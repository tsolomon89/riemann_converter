# Riemann Scale-Gauge Research Engine: Mathematical Framework

> **Relationship to [PROOF_PROGRAM_SPEC.md](PROOF_PROGRAM_SPEC.md).** This document retains the mathematical derivations (explicit formula, Möbius inversion, adaptive tolerances, algorithms). The *interpretation* of what the engine's outputs mean for the research program — theorem candidate, proof obligations, witnesses, controls, pathfinders — lives in the spec. Where this file conflicts with the spec, the spec wins.
>
> **Claim ↔ Obligation mapping.** The historical "Claim 1–4" decomposition in [THEORY.md](THEORY.md) has been recast as proof obligations of the canonical theorem candidate. Cross-reference:
>
> | Historical claim                       | Canonical obligation ID                     | Program |
> |---|---|---|
> | Claim 1 — Coordinate equivariance      | `OBL_COORD_RECONSTRUCTION_COVARIANCE`       | P1 |
> | Claim 2 — Zero equivariance (lattice)  | `OBL_ZERO_SCALING_EQUIVALENCE`              | P1 |
> | Claim 3 — β-stability under scaling    | `OBL_BETA_INVARIANCE`                       | P1 |
> | Claim 4 — Brittleness / detectability  | `OBL_ROGUE_DETECTABILITY` *(exploratory)*   | P2 |
> | (implicit in the conclusion)           | `OBL_EXACT_RH_TRANSPORT`                    | P1 |

## 1. System Overview: The Analytic Interferometer

The **Riemann Scale-Gauge Research Engine** is an instrument that stress-tests the Riemann Hypothesis under discrete scale-gauge transformations. By subjecting the explicit formula to extreme scaling ($X \to X/\tau^k$) and parameter perturbation ($\beta \to \beta + \epsilon$), the system visualizes the structural stability of the analytic continuation and produces the witness / coherence / control / pathfinder / regression data that the proof program consumes.

### 1.1 Strict Separation of Concerns (The "Oracle" Pattern)
To eliminate floating-point errors (IEEE-754) and ensure mathematical rigor, the system uses a strict **Oracle-Observer** architecture:

*   **The Oracle (Backend)**: `experiment_engine.py` using `mpmath`.
    *   **Precision**: **50 Decimal Places** (`mpmath.mp.dps = 50`).
    *   **Zeros**: Computes the first $N=1000$ non-trivial zeros.
    *   **Responsibility**: Performs ALL integration, summation, and log-calculations.
*   **The Observer (Frontend)**: React/Recharts.
    *   **Responsibility**: Pure rendering of pre-computed $(x,y)$ coordinates. No math allowed.

---

## 2. Mathematical Implementations

The system implements the **Riemann-Von Mangoldt Explicit Formula** with specific algorithmic adaptations for computational efficiency and accuracy.

### 2.1 The Master Formula ($J(x)$)
The Prime-Power Counting Function $J(x)$ is reconstructed via the sum over non-trivial zeros $\rho = \beta + i\gamma$.

$$ J(x) = \operatorname{Li}(x) - \sum_{\rho} \operatorname{Li}(x^\rho) + \text{Trivial}(x) $$

**Domain Constraint**: All functions are defined for domain $x \ge 2$. For $x < 2$, functions return $0$.

**Codebase Implementation (`J_Wave`):**
Instead of the complex logarithmic integral $\operatorname{Li}(x^\rho)$, we use the oscillatory approximation term which is standard for explicit formula visualizations:

$$ \text{Oscillatory}(x) = \sum_{n=1}^{1000} \left( \frac{x^{\beta_n}}{\ln x} \cdot \frac{\sin(\gamma_n \ln x)}{\gamma_n} \cdot 2 \right) $$

### 2.2 Trivial Zeros Correction
To ensure accuracy at low $x$ (near $x=2$), we include the contribution from trivial zeros at $s = -2, -4, -6...$.

**Theoretical Integral:**
$$ \int_x^\infty \frac{dt}{t(t^2-1)\ln t} - \ln(2) $$

**Implemented Approximation (`TrivialZeros`):**
For $x > 2$, the integral is approximated to high precision as:
$$ T(x) \approx -\ln(2) + \frac{1}{2 x^2 \ln x} $$

### 2.3 Möbius Inversion ($\pi(x)$)
To visualize the true prime-counting function $\pi(x)$ (which steps by 1 at primes) rather than $J(x)$ (which steps by $1/k$ at $p^k$), we apply the **Möbius Inversion**.

$$ \pi(x) = \sum_{k=1}^{M} \frac{\mu(k)}{k} J(x^{1/k}) $$

**Implemented Terms (`MobiusPi`):**
The engine sums terms until $x^{1/k} < 2$. For our visual range ($x \in [2, 50]$), the following Möbius terms $\mu(k)$ are active:
*   $k=1: \mu=1$
*   $k=2: \mu=-1$
*   $k=3: \mu=-1$
*   $k=5: \mu=-1$
*   $k=6: \mu=1$
*   $k=7: \mu=-1$

### 2.5 Automated Verification (`verifier.py`)
To ensure scientific integrity, the engine runs an automated QA pass (`verifier.py`) immediately after data generation. It enforces strict logic conditions:

1.  **Isometry Check (Exp 1)**: Verifies that the reconstruction curves for different coordinate scales $K$ match geometrically.
    *   **Metric**: Max vertical drift between shifted waves.
    *   **Pass Condition**: Drift $< 10^{-9}$.
2.  **Qualitative Stress Test (Exp 2)**: Verifies that the "Rogue Zero" creates a visible anomaly.
    *   **Metric**: Amplification Factor (Rogue Error / Clean Error).
    *   **Pass Condition**: Factor $> 1.001$ (Signal detected).
3.  **Divergence Check (Exp 3)**: Verifies that the $\beta=\pi$ hypothesis strictly fails.
    *   **Metric**: Ratio of Max Error (Hypothesis) / Max Error (Control).
    *   **Pass Condition**: Separation Factor $> 1000.0$.
4.  **Operator Gauge Falsification (Exp 1B)**: Verifies that scaling the operator (zeros) without the coordinate breaks the symmetry.
    *   **Pass Condition**: Gamma-scaling causes significant drift ($>1.0$).
5.  **Rogue Isolation Check (Exp 2B)**: Verifies that the residual error ratio matches the theoretical prediction.
    *   **Pass Condition**: Max Residual Deviation $< 0.5$.

### 2.6 Execution Flow
The `experiment_engine.py` CLI orchestrates the generation process:
1.  **Initialization**: Sets precision to 50 DPS and loads/computes Riemann Zeros (default 20,000; quick mode: 100).
2.  **State Management**: Loads existing `experiments.json` so partial runs don't destroy prior results.
3.  **Experiment Execution**: Walks the `EXPERIMENT_REGISTRY` in `experiment_engine.py` and dispatches to `run_exp1.py`…`run_exp8.py`. Runs the subset selected by `--run` (or all).
4.  **Verification**: Runs `verifier.py` to grade the results and emit the canonical ontology — `function`, `outcome`, `epistemic_level`, mandatory `inference` rails, `proof_program`, `implementation_health`, and `meta.experiment_classification`. Legacy compatibility fields (`theory_fit`, `role`, `stage_verdicts`) may remain for one release but are not canonical semantics.
5.  **Persistence**: Saves the merged dataset with metadata and verdicts to `public/experiments.json` (the Next.js static root).

---

## 3. Experimental Configurations

The engine runs eleven experiments. Each verdict carries a canonical `function` (what job the experiment does in the proof program), an `outcome` (what happened on this run), an `epistemic_level` (what kind of claim the result licenses), and mandatory `inference` rails (`inference_scope` / `allowed_conclusion` / `disallowed_conclusion`). See [PROOF_PROGRAM_SPEC.md §5–§6](PROOF_PROGRAM_SPEC.md) for the full ontology.

### 3.0 Stage groupings (noncanonical, navigation only)

Every experiment also carries a `stage` label — `gauge`, `lattice`, `brittleness`, or `control`. **This axis is a grouping/navigation affordance only.** It does not carry theorem semantics. There is no stage-level theorem-verdict rollup, no implied proof-progress ordering, and no "stage is load-bearing" hierarchy. Under the canonical Program 1 posture (direct invariance), the proof-directed surface is the obligation list, not the stage list. See [PROOF_PROGRAM_SPEC.md §6 "On the stage axis"](PROOF_PROGRAM_SPEC.md).

Stage memberships (for the sidebar / docs anchors):

| Stage | Members |
|---|---|
| `gauge` | EXP_1, EXP_1B, EXP_6 |
| `lattice` | EXP_1C, EXP_4, EXP_5, EXP_8 |
| `brittleness` | EXP_2, EXP_2B, EXP_7 *(Program 2 exploratory)* |
| `control` | EXP_3 |

### 3.0.1 Function + program classification (canonical)

The `function` axis tells you what job each experiment does in the proof program. The `program` axis tells you which named research program it belongs to — P1 (direct invariance, canonical) or P2 (contradiction-by-detectability, exploratory). These replace the legacy `role` + `theory_fit` axes.

| Exp | Function | Program | Obligation witnessed | Notes |
|---|---|---|---|---|
| EXP_1  | `COHERENCE_WITNESS`          | P1 | `OBL_COORD_RECONSTRUCTION_COVARIANCE` (indirect) | coordinate reconstruction coherence |
| EXP_1B | `CONTROL`                    | P1 | arms coordinate-gauge claim | naive operator scaling must break |
| EXP_1C | `COHERENCE_WITNESS`          | P1 | `OBL_ZERO_SCALING_EQUIVALENCE` (indirect) | zero-scaling isometry coherence |
| EXP_2  | `EXPLORATORY`                | P2 | (optional) `OBL_ROGUE_DETECTABILITY` | centrifuge — Program 2 only |
| EXP_2B | `EXPLORATORY`                | P2 | (optional) `OBL_ROGUE_DETECTABILITY` | rogue isolation — Program 2 only |
| EXP_3  | `CONTROL`                    | P1 | arms β-invariance | β=π counterfactual must diverge |
| EXP_4  | `PATHFINDER`                 | P1 | — | TRANSLATION / DILATION branch selection |
| EXP_5  | `PATHFINDER`                 | P1 | — | lattice-hit / weak / negative branch |
| EXP_6  | `PROOF_OBLIGATION_WITNESS` *(provisional)* | P1 | `OBL_BETA_INVARIANCE` | currently the clearest candidate for theorem-directed evidence on tested settings; subject to `GAP_WITNESS_MAP_REVIEW` and [WITNESS_MAP_REVIEW.md](WITNESS_MAP_REVIEW.md) signoff |
| EXP_7  | `EXPLORATORY`                | P2 | (optional) `OBL_ROGUE_DETECTABILITY` | calibrated ε-sweep — Program 2 only |
| EXP_8  | `REGRESSION_CHECK`           | P1 | — | engine-health plumbing, not evidence |

**Only** a record with `function = PROOF_OBLIGATION_WITNESS`, `outcome = CONSISTENT`, and AUTHORITATIVE fidelity contributes theorem-directed evidence. A passing control / regression / pathfinder / coherence-witness is a *precondition* for trusting evidence, not itself evidence. Every record's `inference.disallowed_conclusion` documents what may not be inferred from it.

No documentation in this sprint may present provisional witness mappings as settled theorem-directed evidence.

### Experiment 1A: Equivariance (Coordinate Gauge)
**Hypothesis**: The distribution of primes is scale-invariant under the gauge $\tau = 2\pi$.
The explicit formula should reconstruct the prime steps identically at any normalized coefficient, provided the coordinate system is scaled inversely.

*   **Scales**: $K \in \{-2, -1, 0, 1, 2\}$.
*   **Method**: **Coordinate Scaling**.
    *   We define a physical window $X_{phys} \in [2\tau^k, 50\tau^k]$.
    *   We evaluate the standard function at the effective coordinate: $X_{eff} = X_{phys} / \tau^k$.
    *   Zeros $\rho$ are **NOT** scaled.
*   **Validation**:
    *   **Visual**: On a Logarithmic Axis, the reconstruction curves should be identical.
    *   **Theoretical**: This proves the function $J(x)$ is isometric under the transformation group.

### Experiment 1B: Operator Gauge (Falsification)
**Hypothesis**: Scaling the operator terms ($\rho$) directly—without a compensating coordinate shift—breaks the symmetry. This confirms the gauge theory is rigid (not just a generic property of sufficiently dense zeros).

*   **Variant B1 (Gamma Scaling)**: $\gamma \to \gamma \cdot \tau^k$, $\beta$ fixed.
    *   Frequencies shift, but amplitudes ($x^\beta$) remain constrained.
    *   **Expectation**: The reconstruction drifts significantly (frequency mismatch).
*   **Variant B2 (Rho Scaling)**: $\rho \to \rho \cdot \tau^k$ (Both $\beta$ and $\gamma$).
    *   $\beta$ scales. At $k=1$, $\beta=0.5 \to 3.14$.
    *   **Expectation**: Amplitude explosion ($x^{3.14}$).
    *   **Verdict**: Serves as a control to prove the model can fail.

### Experiment 1C: Zero Scaling (τ-Lattice)
**Hypothesis**: Scaling the zeros by $\tau^k$ (i.e., $\gamma_n \to \tau^k \gamma_n$) allows for the reconstruction of the prime staircase for the scaled prime lattice $P_k = \{ p\tau^k \}$.
This tests the operator hypothesis directly: "If I build the $\tau$-scaled prime system, does scaling the zeros by $\tau^k$ reconstruct its staircase?"

*   **Scales**: $K \in \{-2, -1, 0, 1, 2\}$.
*   **Method**: **Operator Scaling**.
    *   We define a physical window $X_{phys} \in [2\tau^k, 50\tau^k]$.
    *   **Ground Truth**: $\pi_k^{true}(x_{phys}) = \pi(x_{phys}/\tau^k)$.
    *   **Baseline (Coord)**: Reconstruction using standard zeros and effective coordinate $X_{eff}$.
    *   **Operator Hypothesis**: Reconstruction using scaled zeros $\gamma' = \gamma \cdot \tau^k$ at physical coordinate $X_{phys}$.
*   **Validation**:
    *   **Visual**: The "Operator" reconstruction must match the "Baseline" reconstruction and Ground Truth.
    *   **Metric**: Drift between Operator and Baseline, and Ratio of Operator Error to Baseline Error.
    *   **Pass Condition**: Drift $\le 0.25$ AND Ratio $\le 1.10$.

### Experiment 2: The Centrifuge (Qualitative Stress Test)
**Hypothesis**: The RH is "brittle". A single rogue zero off the critical line causes exponential error growth at high scales.

*   **Gauge**: $k=-20$ (High-Frequency / Deep Zoom).
*   **Effective Scale**: $x_{eff} \approx 10^{17}$.
*   **Metric**: $| \pi_{recon}(x) - \operatorname{Li}(x) |$.
*   **Perturbation**: One zero moved to $\beta = 0.5001$.
*   **Pass Condition**: The rogue error should act "differently" than the clean error (amplification).

### Experiment 2B: Rogue Isolation (Rigorous Theory)
**Hypothesis**: The error growth is dominated *entirely* by the single perturbed zero.

*   **Method**: Calculate difference $D(x) = | \pi_{rogue}(x) - \pi_{clean}(x) |$.
*   **Prediction**: The difference should scale exactly as $x^{\delta \beta}$.
*   **Metric (Residual)**: $R(x) = \text{Observed Ratio} / \text{Predicted Ratio}$.
*   **Validation**: $R(x)$ should be approximately $1.0$ (Flat Line).

### Experiment 3: Falsification
**Hypothesis**: Counter-factual test where $\beta = \pi$.
The amplitude term $x^\pi$ dominates instantly, causing massive divergence.

---

### Experiment 4: Log-Translation vs Log-Dilation
**Goal**: Disambiguate the nature of the scaling effect.
*   **Translation Model**: The reconstruction using scaled zeros is just the baseline reconstruction shifted by $\Delta = -k \ln \tau$ in log-space ($x \to x/\tau^k$).
*   **Dilation Model**: The reconstruction using scaled zeros matches the baseline reconstruction at $x' = x^{\tau^k}$ (Power Law Dilation).
*   **Verdict**: Support for Translation Model implies the "scaling" is a trivial coordinate change. Support for Dilation Model implies a non-trivial operator scaling.

### Experiment 5: Zero Correspondence
**Goal**: Determine if scaled zeros $\gamma_n \tau^k$ map to existing zeros $\gamma_m$ of the Riemann Zeta function.
*   **Method**: Nearest-neighbor search. Calculating mismatch $z$ in units of local mean spacing.
*   **Hypothesis**: If $z < 0.1$ consistently, the scaled zeros are a subset of the true zeros (Lattice Hypothesis). If $z \approx 0.5$ (random), the scaled zeros are distinct.

### Experiment 6: Critical Line Drift
**Goal**: Measure if the reconstruction implicitly prefers a different $\beta$ when scaled.
*   **Method**: Optimize $\beta$ to minimize reconstruction error against a fixed ground truth.
*   **Metric**: $\hat{\beta}(k)$.
*   **Pass Condition**: $\hat{\beta} \approx 0.5$ (Stability).

### Experiment 7: Centrifuge Fix (Relative Amplification)
**Goal**: Measure sensitivity to rogue zeros using a relative, local metric to avoid baseline error dominance.
*   **Method**: "Calibrated Rogue" mode injects a zero perturbation $\epsilon \cdot \text{spacing}$.
*   **Metric**: Amplification factor $A(x) = |E_{rogue} - E_{clean}| / (|E_{clean}| + \eta)$.
*   **Pass Condition**: $A(\epsilon)$ should be monotonic with $\epsilon$.

### Experiment 8: Scaled-Zeta Zero Equivalence
**Goal**: Compare the zeros of the $\tau^k$-scaled zeta function $\zeta(s \cdot \tau^k)$ to the $\tau^k$-scaled baseline zeros $\gamma_n \cdot \tau^k$. If the Lattice claim holds, these two sets should coincide to within numerical tolerance.
*   **Method**: For each $k$, locate the first $N$ zeros of $\zeta(s \cdot \tau^k)$ numerically and pair them against the scaled baseline zeros.
*   **Metrics** (`per_k`):
    *   $p99\, |\Delta|$ — 99th percentile of absolute zero-vs-scaled-zero gap.
    *   $p95\, \text{residual}$ — 95th percentile of normalized residual.
*   **Adaptive Tolerance** (computed by the verifier, not the engine):
    *   $\text{tol}_{\text{zero}} = \max(5 \cdot 10^{-\text{declared\_decimals}},\ 10^{-20})$
    *   $\text{tol}_{\text{residual}} = 10^{-\min(30,\ \text{dps}/2)}$
*   **Pass Condition**: worst $p99\, |\Delta| \le \text{tol}_{\text{zero}}$ AND worst $p95\, \text{residual} \le \text{tol}_{\text{residual}}$.

---

## 4. Codebase Mapping

| Mathematical Concept | Python Function / Module | Formula / Implementation |
| :--- | :--- | :--- |
| **Precision** | `riemann_math.py` | `mpmath.mp.dps = 50` |
| **True Primes** | `riemann_math.TruePi` | `bisect_right(primes, X)` |
| **Logarithmic Integral** | `riemann_math.LogIntegral` | `mpmath.li(X)` |
| **Explicit Formula** | `riemann_math.J_Wave` | $\sum \frac{x^\beta}{\ln x} \frac{2\sin(\gamma \ln x)}{\gamma}$ |
| **Möbius Inversion** | `riemann_math.MobiusPi` | $\sum \frac{\mu(k)}{k} J(x^{1/k})$ |
| **Coordinate Gauge** | `run_exp1.py::run_experiment_1` | $X_{eff} = X_{phys} / \tau^k$ |
| **Operator Gauge** | `run_exp1.py::run_experiment_1b` | $\rho' = \rho \cdot \tau^k$ |
| **τ-Lattice** | `run_exp1.py::run_experiment_1c` | $\gamma' = \gamma \cdot \tau^k$ at $X_{phys}$ |
| **Scaled-ζ Zeros** | `run_exp8.py` | zeros of $\zeta(s \cdot \tau^k)$ |
| **Verification** | `verifier.py` | Canonical classification, adaptive tolerances, proof-program summary, implementation-health summary, regression log |

---

## 5. Data Artifact Specification (`experiments.json`)

The output file is the contract between the Python Oracle and the Next.js Observer. The shape is versioned via `meta.schema_version`; the verifier refuses to grade artifacts whose version does not match `EXPECTED_SCHEMA_VERSION`. The engine produces the raw data + `meta`; `verifier.py` adds the `summary` block, emits the canonical ontology, and appends to `verdict_history.jsonl`.

Each experiment verdict carries the **three orthogonal canonical axes** (PROOF_PROGRAM_SPEC.md §5):

- `function` — what job the experiment does in the proof program (`THEOREM_STATEMENT` / `PROOF_OBLIGATION_WITNESS` / `COHERENCE_WITNESS` / `CONTROL` / `PATHFINDER` / `REGRESSION_CHECK` / `EXPLORATORY`).
- `outcome` — what happened on this run (`CONSISTENT` / `INCONSISTENT` / `DIRECTIONAL` / `INCONCLUSIVE` / `IMPLEMENTATION_OK` / `IMPLEMENTATION_BROKEN`).
- `epistemic_level` — what kind of claim the result licenses (`FORMAL` / `EMPIRICAL` / `HEURISTIC` / `INSTRUMENTAL`).

Every record additionally carries a mandatory `inference` block (`inference_scope`, `allowed_conclusion`, `disallowed_conclusion`) — the drift guardrail. `status` is retained for debugging but is not a theory signal. Legacy compatibility fields (`role`, `theory_fit`, `summary.stage_verdicts`) are deprecated and should only be used for backward-compat reads.

```json
{
  "meta": {
    "schema_version": "2026.05.0",
    "dps": 50,
    "zeros": 1000,
    "tau": 6.28318...,
    "code_fingerprint": { "<filename>": "<md5>", ... },
    "zero_source_info": { "source_path": "...", "declared_decimals": 46, ... },
    "reproducibility_instructions": "python experiment_engine.py ...",
    "experiment_classification": {
      "EXP_1":  { "function": "COHERENCE_WITNESS", "stage": "gauge", "program": "PROGRAM_1", "epistemic_level": "EMPIRICAL", "inference": {"inference_scope": "...", "allowed_conclusion": [...], "disallowed_conclusion": [...]} },
      "EXP_6":  { "function": "PROOF_OBLIGATION_WITNESS", "stage": "gauge", "program": "PROGRAM_1", "epistemic_level": "EMPIRICAL", "obligation_id": "OBL_BETA_INVARIANCE", "inference": {...}, "provisional": true },
      "EXP_8":  { "function": "REGRESSION_CHECK", "stage": "lattice", "program": "PROGRAM_1", "epistemic_level": "INSTRUMENTAL", "inference": {...} },
      "...": "EXP_1B, EXP_1C, EXP_2, EXP_2B, EXP_3, EXP_4, EXP_5, EXP_7"
    }
  },
  "summary": {
    "schema_version": "2026.05.0",
    "engine_status": "OK",
    "overall": "PASS|FAIL",
    "experiments": {
      "EXP_6": {
        "function": "PROOF_OBLIGATION_WITNESS",
        "outcome": "CONSISTENT|INCONSISTENT|INCONCLUSIVE",
        "epistemic_level": "EMPIRICAL",
        "inference": {
          "inference_scope": "this run, tested k-range, AUTHORITATIVE fidelity required",
          "allowed_conclusion": ["beta_hat(k) = 1/2 to within optimizer tolerance on the tested k-range at AUTHORITATIVE fidelity."],
          "disallowed_conclusion": ["beta is invariant at untested k.", "The RH predicate transports exactly under the gauge.", "OBL_BETA_INVARIANCE is formally proven.", "The theorem candidate is proved."]
        },
        "program": "PROGRAM_1",
        "obligation_id": "OBL_BETA_INVARIANCE",
        "stage": "gauge",
        "type": "HYPOTHESIS_TEST",
        "status": "PASS|FAIL|...",
        "metrics": { "beta_hat": 0.5, "drift": 0.0, "...": "..." },
        "interpretation": "...",
        "provisional": true
      },
      "...": "EXP_1, EXP_1B, EXP_1C, EXP_2, EXP_2B, EXP_3, EXP_4, EXP_5, EXP_7, EXP_8"
    },
    "proof_program": {
      "theorem_candidate": { "formal_statement": "...", "plain_language": "...", "non_claims": [...], "working_gauge": {"base": "tau = 2*pi", "unique": false} },
      "obligations": [
        { "id": "OBL_COORD_RECONSTRUCTION_COVARIANCE", "status": "OPEN|WITNESSED|FORMALLY_PROVEN", "witnesses": [...], "program": "PROGRAM_1", "inference": {...}, "...": "..." },
        "OBL_ZERO_SCALING_EQUIVALENCE, OBL_BETA_INVARIANCE, OBL_EXACT_RH_TRANSPORT, OBL_ROGUE_DETECTABILITY"
      ],
      "open_gaps": [
        { "id": "GAP_RH_PREDICATE_TRANSPORT", "title": "...", "description": "...", "blocker_for": ["OBL_EXACT_RH_TRANSPORT"] },
        "GAP_TAU_UNIQUENESS, GAP_COVERAGE_TRANSPORT, GAP_PROGRAM2_FORMALIZATION, GAP_WITNESS_MAP_REVIEW"
      ]
    },
    "implementation_health": {
      "gauge":       { "status": "IMPLEMENTATION_OK|IMPLEMENTATION_BROKEN|MIXED|NO_MEMBERS", "members": ["EXP_1", "EXP_1B", "EXP_6"], "reason": "..." },
      "lattice":     { "status": "...", "members": ["EXP_1C", "EXP_4", "EXP_5", "EXP_8"] },
      "brittleness": { "status": "...", "members": ["EXP_2", "EXP_2B", "EXP_7"] },
      "control":     { "status": "...", "members": ["EXP_3"] }
    },
    "stage_verdicts": "@deprecated compatibility field; replaced by implementation_health + proof_program",
    "zero_path_decision": "SCALE_AD_HOC|COMPUTE_PER_K|UNDECIDED",
    "zero_path_reason": "..."
  },
  "experiment_1":  { "-2": [ {"x": float, "eff_x": float, "y_rec": float, "y_true": float}, ... ], "-1": [...], "0": [...], "1": [...], "2": [...] },
  "experiment_1b": { "variants": { "gamma_scaled": { "<k>": [...] }, "rho_scaled": { "<k>": [...] } } },
  "experiment_1c": { "<k>": [ {"x_eff": float, "x_phys": float, "y_true": float, "y_coord": float, "y_op": float}, ... ] },
  "experiment_2":  { "2A": [ {"x": float, "error": float}, ... ], "2B": [...] },
  "experiment_2b": [ {"x": float, "diff": float, "pred_ratio": float, "obs_ratio": float, "residual": float}, ... ],
  "experiment_3":  { "3A": [...], "3B": [...], "TruePi": [...] },
  "experiment_4":  { "<k>": {"winner": "TRANSLATION|DILATION", "delta_error": float, "rmse_trans": float, "rmse_dil": float, ... } },
  "experiment_5":  { "<k>": {"median_z": float, "mean_z": float, "p95_z": float, ... } },
  "experiment_6":  { "<k>": {"beta_hat": float, "rmse_opt": float, "rmse_05": float, ... } },
  "experiment_7":  { "calibrated": [ {"epsilon": float, "max_amp": float, ... }, ... ] },
  "experiment_8":  { "per_k": { "<k>": {"metrics": {"p99_abs_dev": float, "p95_residual": float, ... }, ... } } }
}
```

### Regression log (`verdict_history.jsonl`)

`verifier.py` appends one JSON line per run to `public/verdict_history.jsonl`:

```json
{"timestamp": "...Z", "schema_version": "2026.05.0", "overall": "PASS|FAIL", "proof_program_status": {"OBL_BETA_INVARIANCE": "WITNESSED", "...": "..."}, "implementation_health": {"gauge": "IMPLEMENTATION_OK", "...": "..."}, "code_fingerprint": {...}, "zero_source_info": {...}, "stage_verdicts": {"...": "... (deprecated compatibility)"}}
```

The canonical regression surface compares obligation status and implementation-health transitions versus prior runs. Legacy `stage_verdicts` may still appear for one-release compatibility.
