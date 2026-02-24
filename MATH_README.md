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
1.  **Initialization**: Sets precision to 50 DPS and loads/computes the first 1000 Riemann Zeros.
2.  **State Management**: Loads existing `experiments.json`.
3.  **Experiment Execution**: Runs `run_exp[1-3].py`.
4.  **Verification**: Runs `verifier.py` to grade the results.
5.  **Persistence**: Saves the merged dataset with metadata and verdicts.

---

## 3. Experimental Configurations

The engine executes three specific experiments to verify the hypothesis properties.

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

---

## 4. Codebase Mapping

| Mathematical Concept | Python Function / Module | Formula / Implementation |
| :--- | :--- | :--- |
| **Precision** | `riemann_math.py` | `mpmath.mp.dps = 50` |
| **True Primes** | `riemann_math.TruePi` | `bisect_right(primes, X)` |
| **Logarithmic Integral** | `riemann_math.LogIntegral` | `mpmath.li(X)` |
| **Explicit Formula** | `riemann_math.J_Wave` | $\sum \frac{x^\beta}{\ln x} \frac{2\sin(\gamma \ln x)}{\gamma}$ |
| **Möbius Inversion** | `riemann_math.MobiusPi` | $\sum \frac{\mu(k)}{k} J(x^{1/k})$ |
| **Coordinate Gauge** | `run_exp1.py` | $X_{eff} = X_{phys} / \tau^k$ |
| **Operator Gauge** | `run_exp1b.py` | $\rho' = \rho \cdot \tau^k$ |
| **Verification** | `verifier.py` | Automated QA checks |

---

## 5. Data Artifact Specification (`experiments.json`)

The output file serves as the strict contract between the Python Oracle and the React Observer.

```json
{
  "meta": {
    "dps": 50,
    "zeros": 1000,
    "tau": 6.28318...,
    "verdicts": {
       "EXP_1": "PASS",
       "EXP_2": "PASS",
       "EXP_3": "PASS"
    }
  },
  "experiment_1": {
    "0": [ { "x": float, "eff_x": float, "y_rec": float, "y_true": float }, ... ],
    "1": [ ... ]
  },
  "experiment_1b": {
      "variants": {
          "gamma_scaled": { 
              "0": [...],
              "1": [ { "x": float, "y_rec": float, "y_rec_amp_renorm": float }, ... ]
          },
          "rho_scaled": { 
              "1": [ { "x": float, "y_rec": float, "status": "ok|error" }, ... ]
          }
      }
  },
  "experiment_2": {
    "2A": [ { "x": float, "error": float }, ... ],
    "2B": [ { "x": float, "error": float }, ... ]
  },
  "experiment_2b": [
      { "x": float, "diff": float, "pred_ratio": float, "obs_ratio": float, "residual": float }, ...
  ],
  "experiment_3": {
    "3A": [ { "x": float, "y": float }, ... ],
    "3B": [ { "x": float, "y": float }, ... ],
    "TruePi": [ { "x": float, "y": float }, ... ]
  }
}
```
