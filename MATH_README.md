# Riemann Scale-Gauge Research Engine: Mathematical Framework

## 1. System Overview: The Analytic Interferometer

The **Riemann Scale-Gauge Research Engine** is an **Analytic Interferometer** designed to stress-test the Riemann Hypothesis (RH) under discrete scale-gauge transformations. By subjecting the explicit formula to extreme scaling ($X \to X/\tau^k$) and parameter perturbation ($\beta \to \beta + \epsilon$), the system visualizes the structural stability of the analytic continuation.

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
4.  **Verification**: Runs `verifier.py` to grade the results, attach a theory `stage` (gauge / lattice / brittleness / control) to each verdict, and emit a `stage_verdicts` rollup.
5.  **Persistence**: Saves the merged dataset with metadata and verdicts to `dashboard/public/experiments.json`.

---

## 3. Experimental Configurations

The engine runs eleven experiment stages across four theory groups. Each verdict records a `stage` field so the `summary.stage_verdicts` rollup can report a single headline status per stage.

### 3.0 Theory Stages

The engine tests a three-stage layered conjecture, in this order:

1.  **Gauge** — The explicit formula has a rigid scale-gauge symmetry under τ = 2π. Coordinate scaling preserves the reconstruction isometrically; operator scaling (ρ or γ alone) breaks it.
    *   Members: **EXP_1** (coordinate gauge), **EXP_1B** (operator-gauge falsification), **EXP_6** (β-stability under scaling).
2.  **Lattice** — Scaled zeros γ·τ^k correspond to true Riemann zeros — an arithmetic self-similarity, not just a coordinate reparametrization.
    *   Members: **EXP_1C** (τ-Lattice direct test), **EXP_4** (translation vs dilation), **EXP_5** (zero correspondence), **EXP_8** (scaled-ζ zero equivalence).
3.  **Brittleness** — Once Gauge and Lattice hold, a single rogue zero with β ≠ ½ produces detectably amplified error under deep zoom, giving a constructive RH falsification path.
    *   Members: **EXP_2** (centrifuge stress test), **EXP_2B** (rogue isolation), **EXP_7** (calibrated sensitivity).

The **Control** group (**EXP_3**, β=π falsification) sits outside the narrative; its PASS means the obviously-wrong hypothesis diverged as expected.

### 3.0.1 Test Roles (orthogonal axis)

The `stage` axis tells you *where* a test lives in the theory. The `role` axis tells you *what job the test does* in the proof-by-contradiction chain (conformality ⇒ compression ⇒ any β≠½ zero is detectable in a vanishingly small interval ⇒ RH). An experiment can belong to any stage and independently play any role; the two axes cross.

| Role | Meaning | How a PASS reads | How a non-PASS reads |
|---|---|---|---|
| **ENABLER** (key 🔑) | Establishes a premise in the chain. | `theory_fit=SUPPORTS` — the chain keeps going. | `theory_fit=REFUTES` — the chain is blocked at this link. |
| **PATHFINDER** (compass 🧭) | Disambiguates *which* mechanism is in play (e.g. coord-reparam vs operator dilation) or *which* path to build out next. | `theory_fit=INFORMATIVE` with a `direction` metric. | `theory_fit=INFORMATIVE` with the opposing `direction`. A pathfinder never fails — it *answers*. |
| **DETECTOR** (radar 📡) | Verifies the rogue-zero detection machinery fires as designed. | `theory_fit=SUPPORTS` — detector is armed. | `theory_fit=REFUTES` — the detector is dead. |
| **FALSIFICATION_CONTROL** (shield 🛡️) | Sanity check that the system can fail on known-bad data. | `theory_fit=SUPPORTS` (the decoy *did* blow up as expected). | `theory_fit=CONTROL_BROKEN` — a dead discriminator, which is theory-refuting. |

Role assignments:

| Exp | Stage | Role | Chain role |
|---|---|---|---|
| EXP_1 | gauge | ENABLER | coordinate-scaling is conformal on the explicit formula |
| EXP_1B | gauge | FALSIFICATION_CONTROL | naive operator-scaling must break |
| EXP_1C | lattice | ENABLER | zeros carry a τ-lattice structure |
| EXP_2 | brittleness | DETECTOR | rogue amplifies at deep k |
| EXP_2B | brittleness | DETECTOR | rogue isolation is theoretically clean |
| EXP_3 | control | FALSIFICATION_CONTROL | β=π diverges vs true π(x) |
| EXP_4 | lattice | **PATHFINDER** | is scaling coord-trivial (TRANSLATION) or op-nontrivial (DILATION)? |
| EXP_5 | lattice | **PATHFINDER** | do scaled zeros land on existing zeros (lattice-hit) or between them (lattice-path-negative)? |
| EXP_6 | gauge | ENABLER | **linchpin**: compression preserves the critical line; without this the RH-contradiction path collapses |
| EXP_7 | brittleness | DETECTOR | detector sensitivity is calibrated |
| EXP_8 | lattice | ENABLER | ζ(s·τ^k) zeros vs τ^k·γₙ — zeta-operator-level equivalence |

Why PATHFINDER is a first-class role: EXP_4 and EXP_5 are not theory-confirmers, they are *direction-setters*. EXP_4 tells you whether the scaling is a coordinate reparametrization (TRANSLATION branch) or a genuine operator dilation (DILATION branch), both of which are theoretically admissible — they just route you down different downstream investigations. EXP_5 tells you whether to pursue the naive τ-lattice ("scaled zeros land on true zeros") or to treat the lattice as emergent from the explicit-formula equivariance. Forcing either experiment into PASS/FAIL pretends there's a binary answer when there isn't; `theory_fit=INFORMATIVE` makes the axis honest.

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
| **Verification** | `verifier.py` | Stage rollups, adaptive tolerances, regression log |

---

## 5. Data Artifact Specification (`experiments.json`)

The output file is the contract between the Python Oracle and the React Observer. The shape is versioned via `meta.schema_version`; the verifier refuses artifacts whose version does not match `EXPECTED_SCHEMA_VERSION`. The engine produces the raw data + `meta`; `verifier.py` adds the `summary` block and appends to `verdict_history.jsonl`.

Each experiment verdict carries **three orthogonal axes**:

- `status` — the *mechanical* outcome (`PASS`/`FAIL`/...). Did the numeric threshold get crossed?
- `theory_fit` — the *theory-centric* outcome (`SUPPORTS`/`REFUTES`/`CANDIDATE`/`INFORMATIVE`/`CONTROL_BROKEN`/`INCONCLUSIVE`). Does the observed result support, refute, or inform the Gauge→Lattice→Brittleness conjecture?
- `role` — the *chain-role* (`ENABLER`/`PATHFINDER`/`DETECTOR`/`FALSIFICATION_CONTROL`). What job does this test do in the proof-by-contradiction chain? See §3.0.1.

Polarity matters: for `FALSIFICATION_CONTROL` experiments, mechanical `PASS` (the falsifier exploded as predicted) maps to `theory_fit = SUPPORTS`; mechanical `FAIL` (the falsifier did not trigger — a dead discriminator) maps to `theory_fit = CONTROL_BROKEN`. For `PATHFINDER` experiments, any decisive outcome (hit OR miss) maps to `theory_fit = INFORMATIVE` — a pathfinder's job is to pick a direction, not to pass/fail the theory. Stage rollups aggregate over `theory_fit`, not `status`.

```json
{
  "meta": {
    "schema_version": "2026.04.3",
    "dps": 50,
    "zeros": 1000,
    "tau": 6.28318...,
    "code_fingerprint": { "<filename>": "<md5>", ... },
    "zero_source_info": { "source_path": "...", "declared_decimals": 46, ... },
    "reproducibility_instructions": "python experiment_engine.py ..."
  },
  "summary": {
    "schema_version": "2026.04.3",
    "engine_status": "OK",
    "overall": "PASS|FAIL",
    "experiments": {
      "EXP_1": {
        "stage": "gauge|lattice|brittleness|control",
        "role": "ENABLER|PATHFINDER|DETECTOR|FALSIFICATION_CONTROL",
        "type": "VALIDATION|HYPOTHESIS_TEST|FALSIFICATION_CONTROL",
        "status": "PASS|FAIL|NOTEWORTHY|INCONCLUSIVE|INSUFFICIENT_DATA|INSUFFICIENT_SEPARATION|SKIP",
        "theory_fit": "SUPPORTS|REFUTES|CANDIDATE|INFORMATIVE|CONTROL_BROKEN|INCONCLUSIVE",
        "metrics": { "...": "numeric metrics; PATHFINDER rows include 'direction' e.g. 'TRANSLATION', 'lattice-hit', 'lattice-path-negative'" },
        "interpretation": "..."
      },
      "...": "EXP_1B, EXP_1C, EXP_2, EXP_2B, EXP_3, EXP_4, EXP_5, EXP_6, EXP_7, EXP_8"
    },
    "stage_verdicts": {
      "gauge":       { "status": "SUPPORTS|REFUTES|CANDIDATE|PARTIAL|INCONCLUSIVE", "reason": "...", "members": ["EXP_1", "EXP_1B", "EXP_6"], "member_fits": {"EXP_1": "SUPPORTS", ...}, "role_breakdown": {"ENABLER": 2, "FALSIFICATION_CONTROL": 1} },
      "lattice":     { "status": "...", "reason": "...", "members": ["EXP_1C", "EXP_4", "EXP_5", "EXP_8"], "member_fits": {...}, "role_breakdown": {"ENABLER": 2, "PATHFINDER": 2} },
      "brittleness": { "status": "...", "reason": "...", "members": ["EXP_2", "EXP_2B", "EXP_7"], "member_fits": {...}, "role_breakdown": {"DETECTOR": 3} },
      "control":     { "status": "...", "reason": "...", "members": ["EXP_3"], "member_fits": {...}, "role_breakdown": {"FALSIFICATION_CONTROL": 1} }
    },
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

`verifier.py` appends one JSON line per run to `dashboard/public/verdict_history.jsonl`:

```json
{"timestamp": "...Z", "schema_version": "2026.04.3", "overall": "PASS|FAIL", "stage_verdicts": {"gauge": "SUPPORTS", ...}, "code_fingerprint": {...}, "zero_source_info": {...}}
```

A stage verdict flip vs. the prior line prints a loud `[REGRESSION]` warning. The dashboard's `VerdictHistoryPanel` reads the last 10 lines of this file.
