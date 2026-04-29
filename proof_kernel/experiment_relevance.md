# Experiment Relevance Audit

> This audit determines whether each existing experiment actually bears on
> the base compression claim and its necessary conditions. Classification
> is based on reading the `run_exp*.py` source code, not the existing labels.
>
> See [base_claim.md](base_claim.md) for the claim.
> See [necessary_conditions.md](necessary_conditions.md) for the conditions.

---

## Audit method

For each experiment:
1. What does the code actually compute? (from `run_exp*.py`)
2. What mathematical object does it touch?
3. Which necessary condition could it witness?
4. Could failure kill the theory, or only kill this witness/route?
5. Classification and recommended action.

---

## EXP_1 — Harmonic Converter (CORE-1)

**Source:** `run_exp1.py::run_experiment_1`

**What it actually computes:**
- Builds the harmonic converter: Li(x_eff) − Σ WavePair(γ_j, x_eff) under
  the tau substitution x_eff = X/τ^k.
- For each k in {−2,−1,0,1,2}, evaluates the reconstruction at scaled
  X coordinates using **the same unscaled zero set**.
- Reports max drift between k=0 and other k values.
- Also runs a "scaled coordinate stress" branch that evaluates
  MobiusPi(x·τ^k) vs TruePi(x·τ^k) — reconstruction at physical coords.

**Object touched:** `explicit_formula_reconstruction`

**Bears on conditions:** NC1 (object exists and computes), NC3 (if the
same-case criterion includes reconstruction agreement)

**Does NOT bear on:** NC4 (predicate transport), NC6 (no hiding),
NC7 (contradiction closure)

**Failure scope:** `KILL_FORMALIZATION` — reconstruction doesn't covary.
Does not kill the theory unless NC3 requires reconstruction covariance
AND NC3 is established as genuinely necessary for NC4.

**Classification:** `NECESSARY_WITNESS` — directly tests the primary
object candidate under the gauge.

**Certificate role:** Populates `reconstruction_agreement` section.

**Recommended action:** `KEEP`

---

## EXP_1B — Operator Scaling Control (CTRL-1)

**Source:** `run_exp1.py::run_experiment_1b`

**What it actually computes:**
- Variant B1: scales gammas by τ^k but keeps β=0.5. Expects frequency
  mismatch → drift.
- Variant B2: scales full ρ (both β and γ). Expects amplitude explosion
  at β·τ^k.

**Object touched:** `explicit_formula_reconstruction` (under a deliberately
wrong transformation)

**Bears on conditions:** NC2 (gauge definition — shows gauge is rigid,
not trivially satisfied by any scaling)

**Does NOT bear on:** NC3, NC4, NC5, NC6, NC7

**Failure scope:** `KILL_IMPLEMENTATION` — if the wrong scaling doesn't
fail, the instrument is unreliable.

**Classification:** `CONTROL` — arms the falsifier. A passing control is
an instrument-health signal, not theory evidence.

**Certificate role:** Populates `controls.wrong_operator_scaling_fails`.

**Recommended action:** `KEEP`

---

## EXP_1C — Zero Scaling Hypothesis (NOTE-1)

**Source:** `run_exp1.py::run_experiment_1c`

**What it actually computes:**
- For each k, scales gammas by τ^k and evaluates MobiusPi at physical
  coordinates x_phys = x_eff · τ^k using the scaled zeros.
- Compares against baseline (coordinate gauge with unscaled zeros) and
  ground truth TruePi(x_eff).

**Object touched:** `zero_ensemble` and `explicit_formula_reconstruction`

**Bears on conditions:** NC1 (shows the scaled-zero reconstruction matches
the coordinate reconstruction). Partially NC3 (if the same-case criterion
involves zero-scaling correspondence).

**Does NOT bear on:** NC4, NC6, NC7

**Failure scope:** `KILL_WITNESS` — the operator-scaling and coordinate-
scaling don't agree. Does not kill the theory.

**Current function in FUNCTION_MAP:** `RESEARCH_NOTE` — correctly demoted
from witness status in earlier audit.

**Classification:** `OPTIONAL_WITNESS` — informative but not load-bearing.

**Certificate role:** Secondary evidence for zero_handling.

**Recommended action:** `KEEP` as research note.

---

## EXP_2 — Centrifuge (Brittleness)

**Source:** `run_exp2.py`

**What it actually computes:**
- Plants a rogue zero at β=0.5001 and measures amplification at k=−20.
- Reports amplification factor (rogue error / clean error).

**Object touched:** `explicit_formula_reconstruction` (under perturbation)

**Bears on conditions:** NC6 (no hiding — does the rogue zero produce a
detectable signature?)

**Does NOT bear on:** NC1, NC2, NC3, NC4 (direct transport), NC7

**Failure scope:** `KILL_ROUTE` — Program 2 fails. Does not touch
Program 1 (direct transport).

**Classification:** `OPTIONAL_WITNESS` — Program 2 exploratory only.

**Certificate role:** Populates `counterexample_visibility` (informational,
not load-bearing for certificate status).

**Recommended action:** `KEEP` as exploratory.

---

## EXP_2B — Rogue Isolation

**Source:** `run_exp2.py` (second section)

**What it actually computes:**
- Measures D(x) = |π_rogue(x) − π_clean(x)| and checks if it scales as
  x^(δβ) as predicted.

**Object touched:** `explicit_formula_reconstruction` (perturbation theory)

**Bears on conditions:** NC6 (same as EXP_2)

**Failure scope:** `KILL_ROUTE` — Program 2 only.

**Classification:** `OPTIONAL_WITNESS` — Program 2 exploratory.

**Certificate role:** Same as EXP_2.

**Recommended action:** `KEEP` as exploratory.

---

## EXP_3 — Beta Counterfactual Control (CTRL-2)

**Source:** `run_exp3.py`

**What it actually computes:**
- Evaluates reconstruction with β=π (deliberately wrong). Expects massive
  divergence because x^π dominates.

**Object touched:** `explicit_formula_reconstruction` (under deliberately
wrong β)

**Bears on conditions:** NC2 (instrument health — arms the β-invariance
measurement)

**Does NOT bear on:** NC3, NC4, NC5, NC6, NC7

**Failure scope:** `KILL_IMPLEMENTATION` — if β=π doesn't diverge, the
instrument is unreliable.

**Classification:** `CONTROL`

**Certificate role:** Populates `controls.wrong_beta_fails`.

**Recommended action:** `KEEP`

---

## EXP_4 — Translation vs Dilation (PATH-1)

**Source:** `run_exp4.py`

**What it actually computes:**
- Compares two models: log-translation (reconstruction shifted by
  −k·ln(τ) in log-space) vs log-dilation (x' = x^(τ^k)).
- Reports which model has lower RMSE.

**Object touched:** `explicit_formula_reconstruction`

**Bears on conditions:** None directly. This is a mechanism disambiguation,
not a claim test.

**Does NOT bear on:** NC1 through NC7. Identifying whether the scaling
is a translation or dilation does not test whether the RH predicate
transports.

**Failure scope:** `NO_THEORETICAL_EFFECT` — the translation/dilation
distinction does not affect the base claim.

**Classification:** `PATHFINDER`

**Certificate role:** None. Excluded from certificate.

**Recommended action:** `KEEP` as research direction tool, but mark as
non-certificate-bearing.

---

## EXP_5 — Zero Correspondence (PATH-2)

**Source:** `run_exp5.py`

**What it actually computes:**
- Nearest-neighbor search: do scaled zeros γ_n · τ^k map to existing
  zeros γ_m of ζ?
- Reports mismatch z in units of local mean spacing.

**Object touched:** `zero_ensemble`

**Bears on conditions:** Marginally NC1 (do the zeros form a lattice?).
The result does not affect whether the RH predicate transports.

**Failure scope:** `NO_THEORETICAL_EFFECT` — the lattice hypothesis is
an open research question, not a necessary condition.

**Classification:** `PATHFINDER`

**Certificate role:** None. Excluded from certificate.

**Recommended action:** `KEEP` as research direction tool.

---

## EXP_6 — Beta Stability (VAL-1)

**Source:** `run_exp6.py::run_experiment_6`

**What it actually computes:**
- For each k in {0,1,2}, walks x_eff over [10,100], computes
  x_phys = x_eff · τ^k.
- truth = TruePi(x_phys, primes)
- For candidate β values, evaluates MobiusPi(x_phys, β, gammas_PRISTINE)
  using the **same unscaled zeros**.
- Picks the β that minimizes RMSE.
- Reports beta_hat(k).

**Object touched:** `rh_predicate` (via the β optimizer)

**Bears on conditions:** NC4 (the closest empirical proxy for predicate
transport — if beta_hat(k) ≠ ½, the critical line is not preserved).
Also NC3 (if the same-case criterion includes β-invariance).

**Does NOT bear on:** NC5, NC6, NC7

**Failure scope:** A beta_hat(k) significantly different from ½ would be
strong evidence against NC4. However, EXP_6 is numerical — it cannot
prove NC4, only fail to disprove it.

If beta_hat drifts: `KILL_FORMALIZATION` at minimum. Potentially
`KILL_THEORY` if the drift is large and robust across fidelity tiers.

**Classification:** `NECESSARY_WITNESS` — the clearest empirical proxy
for predicate transport.

**Certificate role:** Populates `predicate_preservation`.

**Recommended action:** `KEEP` — this is the most important experiment
for the certificate.

---

## EXP_7 — Calibrated ε-Sweep

**Source:** `run_exp7.py`

**What it actually computes:**
- Injects calibrated rogue perturbations ε·spacing and measures
  amplification A(x) = |E_rogue − E_clean| / (|E_clean| + η).
- Tests monotonicity of A(ε).

**Object touched:** `explicit_formula_reconstruction` (under perturbation)

**Bears on conditions:** NC6 (same as EXP_2/2B)

**Failure scope:** `KILL_ROUTE` — Program 2 only.

**Classification:** `OPTIONAL_WITNESS` — Program 2 exploratory.

**Certificate role:** Same as EXP_2.

**Recommended action:** `KEEP` as exploratory.

---

## EXP_8 — Scaled-Zeta Zero Equivalence (WIT-1)

**Source:** `run_exp8.py::run_experiment_8`

**What it actually computes:**
- Defines F_k(s) = ζ(0.5 + (s−0.5)/τ^k).
- Predicts mapped zeros: t_pred(n,k) = τ^k · γ_n.
- Refines each prediction using Siegel Z-function root finding.
- Reports p99/p95 absolute deviation and residuals.

**Object touched:** `zero_ensemble` and `transformed_zeta_model`

**Bears on conditions:** NC1 (zero ensemble is well-defined under the
gauge), NC3 (if the same-case criterion includes zero correspondence).

**Does NOT bear on:** NC4 (zero correspondence is necessary but not
sufficient for predicate transport), NC6, NC7.

**Failure scope:** `KILL_FORMALIZATION` — the scaled-zero prediction
fails. But zero correspondence at finite precision does not prove
predicate transport.

**Classification:** `NECESSARY_WITNESS` — directly tests the zero
ensemble under the gauge.

**Certificate role:** Populates `zero_handling.zero_correspondence`.

**Recommended action:** `KEEP`

---

## EXP_9 — Bounded View Demonstration

**Source:** `run_exp9.py`

**What it actually computes:**
- Demonstrates that the reconstruction window [2, 50] under the gauge
  maps to compressed ranges at each k.

**Object touched:** Gauge geometry (not an analytic object per se).

**Bears on conditions:** NC5 (bounded-view reduction).

**Classification:** `ILLUSTRATION` — demonstrates known gauge geometry.

**Certificate role:** Populates `window.bounded_window_demonstrated`.

**Recommended action:** `KEEP`

---

## EXP_10 — Zeta-Direct Gauge Transport

**Source:** `run_exp10.py`

**What it actually computes:**
- Directly compares ζ(0.5+it) vs ζ(0.5+iτ^k·t).
- Reports residual. Explicitly notes the residual will NOT be zero
  because ζ has no known non-trivial multiplicative automorphism.

**Object touched:** `transformed_zeta_model`

**Bears on conditions:** Informational only. Confirms the **wrong test**
(ζ(t) ≠ ζ(τ^k·t)) to prevent misinterpretation.

**Failure scope:** `NO_THEORETICAL_EFFECT` — the result is expected.
EXP_10 exists to show what the theory does NOT claim.

**Classification:** `ILLUSTRATION` — prevents the wrong test from being
mistaken for the right test.

**Certificate role:** Excluded from certificate status. Referenced in
disallowed conclusions.

**Recommended action:** `KEEP` as guardrail.

---

## Summary table

| Exp | Source object | Key NC | Kill scope | Classification | Certificate section |
|---|---|---|---|---|---|
| EXP_1 | reconstruction | NC1, NC3 | KILL_FORMALIZATION | NECESSARY_WITNESS | reconstruction_agreement |
| EXP_1B | reconstruction (wrong) | NC2 | KILL_IMPLEMENTATION | CONTROL | controls |
| EXP_1C | zero+reconstruction | NC1 | KILL_WITNESS | OPTIONAL_WITNESS | zero_handling (secondary) |
| EXP_2 | reconstruction (perturbed) | NC6 | KILL_ROUTE | OPTIONAL_WITNESS | counterexample_visibility |
| EXP_2B | reconstruction (perturbed) | NC6 | KILL_ROUTE | OPTIONAL_WITNESS | counterexample_visibility |
| EXP_3 | reconstruction (wrong β) | NC2 | KILL_IMPLEMENTATION | CONTROL | controls |
| EXP_4 | reconstruction | — | NO_THEORETICAL_EFFECT | PATHFINDER | excluded |
| EXP_5 | zero_ensemble | — | NO_THEORETICAL_EFFECT | PATHFINDER | excluded |
| EXP_6 | rh_predicate | **NC4** | KILL_FORMALIZATION/THEORY | **NECESSARY_WITNESS** | **predicate_preservation** |
| EXP_7 | reconstruction (perturbed) | NC6 | KILL_ROUTE | OPTIONAL_WITNESS | counterexample_visibility |
| EXP_8 | zero_ensemble | NC1, NC3 | KILL_FORMALIZATION | NECESSARY_WITNESS | zero_handling |
| EXP_9 | gauge geometry | NC5 | KILL_ROUTE | ILLUSTRATION | window |
| EXP_10 | transformed_zeta | — | NO_THEORETICAL_EFFECT | ILLUSTRATION | excluded |

---

## Verdict: Does the existing ladder survive?

**Partially.** The three core witnesses (EXP_1, EXP_6, EXP_8) are correctly
identified as load-bearing. The controls (EXP_1B, EXP_3) are correctly
positioned. The pathfinders (EXP_4, EXP_5) and illustrations (EXP_9,
EXP_10) are correctly demoted.

**What changes:** The existing obligation ladder's obligations 1–3
(OBL_COORD_RECONSTRUCTION_COVARIANCE, OBL_ZERO_SCALING_EQUIVALENCE,
OBL_BETA_INVARIANCE) map to necessary conditions NC1/NC3/NC4 but are
**not themselves sufficient**. The missing NC3 (same-case criterion) means
the ladder has three proxies for a definition that doesn't yet exist.

**What the certificate adds:** It assembles EXP_1 + EXP_6 + EXP_8 +
controls into a single structured report with an explicit allowed/
disallowed conclusion. The existing ladder never produced this.
