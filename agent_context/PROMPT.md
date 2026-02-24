Below is a **revised prompt** that focuses on **what** we’re building, **why**, the **math objects**, and the **visual + computational verification**. It assumes the agent already knows how to implement and structure code.

---

## Prompt: Tau-Lattice RH Visual + Verification Program

You are building a research-grade program to **replicate and extend** the exact mathematical/visual framework used in the “What is the Riemann Hypothesis REALLY about?” (Hexagon) video, and then run a **τ-lattice scaling experiment** on that framework.

### Goal in one sentence

Reproduce the video’s “prime steps emerge by subtracting Riemann-harmonic waves from (\mathrm{Li}(x))” demo with high-precision zeros, then apply a **τ-scaling lens** and verify whether the entire construction behaves as a **trivial scaling symmetry** (as it should if it’s “just units”), while also quantifying sensitivity via the **Schoenfeld bound**.

---

# 1) The Baseline Model (what we must replicate exactly)

### 1.1 The “Riemann Converter” (point → wave)

For a complex zero (\rho), define the wave:

[
\mathrm{Wave}(\rho,x) := \mathrm{Li}(x^\rho) = \mathrm{Ei}(\rho\ln x).
]

We visualize the **real-valued contribution** because zeros come in conjugate pairs (\rho, \bar{\rho}), and the imaginary parts cancel in the summed correction:

[
\mathrm{WavePair}(\gamma,x) := 2,\Re\left(\mathrm{Ei}((\tfrac12+i\gamma)\ln x)\right).
]

**Interpretation (must show in UI):**

* (\Re(\rho)=a) controls growth (\sim x^a).
* (\Im(\rho)=\gamma) controls oscillation frequency in (\ln x).

### 1.2 The tuning process (base + corrections)

The video’s construction is a “carrier + correction” model:

* Carrier:
  [
  \mathrm{Base}(x)=\mathrm{Li}(x)
  ]
* Correction from zeros:
  [
  \mathrm{Correction}*N(x)=\sum*{j=1}^{N} \mathrm{WavePair}(\gamma_j,x)
  ]
* Reconstructed count (video-style):
  [
  \pi_N(x);\approx;\mathrm{Li}(x) - \mathrm{Correction}_N(x)
  ]

**Important:** The minus sign is part of the meaning: (\mathrm{Li}(x)) overestimates and the zeros correct it.

### 1.3 What we display (must match the video)

Provide an interactive plot that overlays, for the same x-range:

1. **True** (\pi(x)) (computed by sieve, shown as a step function).
2. (\mathrm{Li}(x)) (smooth curve).
3. (\pi_N(x)) for multiple N: e.g. N = 0, 1, 3, 10, 50, 200.

**Visual expectation:** As N increases, (\pi_N(x)) should develop visible “steps” that increasingly align with the primes 2, 3, 5, 7, 11, …

(If the exact explicit formula requires minor corrections like (-\log 2) or (J(x)) + Möbius inversion to make steps land cleanly on primes rather than prime powers, you may implement those—but the display must preserve the same conceptual “Base − Sum(Waves)” story, and you must explain what corrections were needed and why.)

---

# 2) Precision + Verification (what we require and why)

We are not doing this for aesthetics. We need **reliable zeros** and we must prove our pipeline isn’t hallucinating.

### 2.1 Zeros to high precision

Compute the first **at least 200** nontrivial zeros on the critical line:
[
\rho_j = \tfrac12 + i\gamma_j
]
to **≥60 decimal digits** (compute internally at higher precision, e.g. 80–120 digits).

### 2.2 Verification requirement (three layers)

For the computed (\gamma_j), we need:

1. **Internal certification:** show (numerically or interval-certified) that (\zeta(\rho_j)=0) to the required precision.
2. **Independent cross-check:** compute zeros with a second independent method/library and compare (\gamma_j) agreement to ≥60 digits.
3. **External reference sanity-check:** compare at least the first ~30 digits against a reputable published dataset (LMFDB/Odlyzko), and explicitly note the dataset’s stated precision limits.

Deliverables must include a report with:

* max deviation across methods,
* per-index deviations for the first 200 zeros,
* and any library/version/precision settings used.

---

# 3) The τ-Lattice Scaling Experiment (the actual research question)

### 3.1 The “trivial scaling” thesis

We interpret “primes at τ-scale” as a **scaled embedding**:
[
P_k := {p,\tau^k:\ p\ \text{prime}}.
]

Corresponding counting function:
[
\pi_k(X)=#{p\tau^k\le X} = \pi(X/\tau^k).
]

This is, in principle, **only a coordinate/unit change**.

### 3.2 What we must test visually

We must replicate the exact same “tuning” visualization, but in τ-scaled x-units:

* We plot a scaled x-axis (X).
* We define (x := X/\tau^k).
* We evaluate the same reconstruction at (x), but plot the result against (X).

Concretely: for each (k\in{0,1,2,5,10}),
overlay:

1. True scaled steps: (\pi(X/\tau^k)) as a step function in (X).
2. Scaled base: (\mathrm{Li}(X/\tau^k)).
3. Scaled reconstruction: (\pi_N(X/\tau^k)) using the same zeros and same formula.

**Visual claim we want to confirm:** The jumps land at (X = p,\tau^k) with the same interference pattern logic.

### 3.3 What should *not* happen (this is a sanity constraint)

Unit scaling must not “move” the critical line. If any part of the implementation seems to suggest the real-part condition is changing from (1/2) to (1/(2\pi)) or similar, that is an error in interpretation or formula application. The only legitimate “change” under scaling is a shift in (\ln x) (phase offsets), not relocation of zeros.

---

# 4) Error Bound Lens (Schoenfeld) and Sensitivity

The video frames RH’s consequence via a strict error bound (Schoenfeld):

[
|\pi(x)-\mathrm{Li}(x)| < \frac{\sqrt{x},\ln x}{8\pi}\quad\text{for }x\ge 2657.
]

### 4.1 What we compute

For any computed / reconstructed curve, compute:

* empirical error: (E(x):=\pi(x)-\pi_N(x)) and/or (\pi(x)-\mathrm{Li}(x))
* compare to Schoenfeld bound where applicable
* show a plot of (|\pi(x)-\mathrm{Li}(x)|) and the RHS bound on the same axes (where domain applies)

### 4.2 Scaled bound

Under τ-scaling (x=X/\tau^k), compute the bound on the scaled axis:

[
B_k(X)=\frac{\sqrt{X/\tau^k},\ln(X/\tau^k)}{8\pi}.
]

Overlay (|\pi(X/\tau^k)-\mathrm{Li}(X/\tau^k)|) vs (B_k(X)) for multiple k.

**Purpose:** quantify whether scaling makes the bound “easier” or “harder” to satisfy purely by unit effects, and confirm it behaves exactly as expected under substitution.

---

# 5) Optional stress test: “rogue real part” injection (to prove sensitivity mechanism)

To demonstrate the transcript’s logic that a single zero with (a>1/2) breaks the bound “eventually,” implement a **synthetic** mode where you replace (\tfrac12) with (\tfrac12+\varepsilon) in the wave generator:

[
\mathrm{WavePair}_\varepsilon(\gamma,x) := 2,\Re(\mathrm{Ei}((\tfrac12+\varepsilon+i\gamma)\ln x)).
]

Then show:

* for fixed (\varepsilon>0), as x grows, the error envelope eventually violates the (\sqrt{x}\ln x) growth regime,
* and how τ-scaling changes where that failure becomes visually apparent when plotted in (X)-units.

This is not evidence about RH—it is a validation of the **mechanism** described in the video.

---

# 6) Outputs we must deliver

### 6.1 Visual outputs (non-negotiable)

1. **Prime steps emergence plot:** multiple N curves vs true π(x) in x∈[0,50] (or [0,100]).
2. **τ-lattice plots:** same but for k = 0,1,2,5,10 with x-axis labeled in (X) units and steps at (p\tau^k).
3. **Error/bound plots:** Schoenfeld bound overlays (unscaled and scaled).
4. If synthetic rogue mode exists: “failure vs x” plot demonstrating growth mismatch.

### 6.2 Verification outputs

* A machine-readable file of zeros with at least 200 (\gamma_j) to ≥60 digits.
* A verification report that:

  * confirms zeros are correct (ζ(ρ)=0),
  * shows cross-method agreement to ≥60 digits,
  * and matches external reference digits where possible.

---

# 7) What “success” means

We consider the program correct when:

1. The prime-step visualization behaves like the video (steps sharpen as N grows).
2. τ-scaling behaves as a substitution symmetry: plotting in (X)-units yields jumps at (p\tau^k) without changing the zeros.
3. Verification shows the zero list is correct to the target digits.
4. The Schoenfeld bound transforms exactly under scaling and the plots reflect that.

---

Use the analysis summary above as the baseline mathematical spec. Your job is to implement the computational pipeline and visualizations faithfully, then report results and any deviations from the video’s simplified formula that were necessary for accuracy (e.g., using (J(x)) then Möbius inversion).

Do not guess. If you need a formula detail, research authoritative sources and cite them in the README.
