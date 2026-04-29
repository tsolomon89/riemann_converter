import argparse
import copy
import json
import os
import math
import datetime
import time

# Proof-kernel integration
from proof_kernel.scoped_failure import (
    build_proof_assembly,
    load_certificate,
    classify_experiment_failure,
    FailureScope,
)

# Output paths. The Next.js app serves files under repo-root `public/`.
OUTPUT_FILE = "public/experiments.json"
HISTORY_FILE = "public/verdict_history.jsonl"

# Must match experiment_engine.SCHEMA_VERSION. Bump in both places when the
# artifact shape changes (top-level keys, summary shape, stage names, etc.).
EXPECTED_SCHEMA_VERSION = "2026.05.0"
RUN_EVENT_PREFIX = os.getenv("RIEMANN_RUN_EVENT_PREFIX", "@@RUN_EVENT@@")
VERIFICATION_EXPERIMENT_IDS = [
    "EXP_1",
    "EXP_1B",
    "EXP_1C",
    "EXP_2",
    "EXP_2B",
    "EXP_3",
    "EXP_4",
    "EXP_5",
    "EXP_6",
    "EXP_7",
    "EXP_8",
    "EXP_9",
]


def atomic_json_dump(target_path, payload):
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    temp_path = f"{target_path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(temp_path, target_path)


def emit_run_event(
    enabled,
    kind="PY_EVENT",
    phase=None,
    state=None,
    message=None,
    completed_units=None,
    total_units=None,
    percent=None,
    payload=None,
):
    if not enabled:
        return
    event = {"kind": kind}
    if phase is not None:
        event["phase"] = phase
    if state is not None:
        event["state"] = state
    if message is not None:
        event["message"] = message
    if completed_units is not None:
        event["completed_units"] = int(completed_units)
    if total_units is not None:
        event["total_units"] = int(total_units)
    if percent is not None:
        event["percent"] = float(percent)
    if payload is not None:
        event["payload"] = payload
    print(f"{RUN_EVENT_PREFIX}{json.dumps(event, separators=(',', ':'))}", flush=True)

# Fidelity tiers — declared floor for theory-centric grading.
#
# Problem these solve: at low zero counts / low precision, numerical artifacts
# (e.g. EXP_6's beta optimizer stabilizing at ~0.43 when N=100) produce
# mechanical REFUTES that have to be explained away post-hoc. Principled fix:
# the verifier refuses to translate mechanical outcomes into theory_fit
# verdicts below a declared floor.
#
# Policy (hard clamp):
#   SMOKE tier:         ENABLER / DETECTOR theory_fits clamped to INCONCLUSIVE
#   STANDARD tier:      ENABLER theory_fits retained but tagged `provisional`
#   AUTHORITATIVE tier: unchanged
#
# FALSIFICATION_CONTROL (EXP_1B, EXP_3) and PATHFINDER (EXP_4, EXP_5) are
# NEVER clamped: controls must diverge regardless of N; pathfinders compare
# two models on the same data, so noise affects both equally.
FIDELITY_SMOKE_MAX_ZEROS = 500
FIDELITY_STANDARD_MAX_ZEROS = 10000
FIDELITY_MIN_DPS = 35
FIDELITY_AUTHORITATIVE_MIN_DPS = 50


def compute_fidelity_tier(zeros, dps):
    """Return one of "SMOKE", "STANDARD", "AUTHORITATIVE" based on zero
    count and dps. Missing/non-numeric values degrade conservatively to SMOKE.
    """
    try:
        z = int(zeros)
    except (TypeError, ValueError):
        return "SMOKE"
    try:
        d = float(dps)
    except (TypeError, ValueError):
        return "SMOKE"
    if z < FIDELITY_SMOKE_MAX_ZEROS or d < FIDELITY_MIN_DPS:
        return "SMOKE"
    if z < FIDELITY_STANDARD_MAX_ZEROS or d < FIDELITY_AUTHORITATIVE_MIN_DPS:
        return "STANDARD"
    return "AUTHORITATIVE"

# Theory stage for each experiment. Tracks the Gauge -> Lattice -> Brittleness
# ordering of the three-stage conjecture. "control" is the global falsification
# sanity check (Exp 3) plus the operator-gauge falsification (Exp 1B).
STAGE_MAP = {
    "EXP_0":  "core_visualization",   # zeta on critical line; not a voting stage
    "EXP_1":  "gauge",
    "EXP_1B": "gauge",        # operator-gauge falsification belongs with Gauge
    "EXP_6":  "gauge",        # beta-stability under scaling = gauge invariance consequence
    "EXP_1C": "lattice",
    "EXP_4":  "lattice",      # translation vs dilation disambiguation
    "EXP_5":  "lattice",      # scaled zeros vs true zeros correspondence
    "EXP_8":  "lattice",      # scaled-zeta zero equivalence
    "EXP_2":  "brittleness",
    "EXP_2B": "brittleness",
    "EXP_7":  "brittleness",
    "EXP_3":  "control",
    "EXP_9":  "demonstration",   # bounded-view demonstration; not a witness
    "EXP_10": "transport",       # zeta-direct gauge transport residual; not a voting stage
}

# Control-type verdicts (falsification experiments) don't count toward their
# stage's pass/fail rollup because their PASS means "the counter-test failed
# as expected". They're reported separately.
_CONTROL_TYPES = {"FALSIFICATION_CONTROL"}


# Role of each experiment in the theory chain (orthogonal to `stage`).
#
# ENABLER              - establishes a premise in the conformality ->
#                        compression -> RH-contradiction chain. Its PASS
#                        unlocks a step. Its FAIL blocks that step.
# PATHFINDER           - disambiguates a mechanism or labels a direction.
#                        A decisive outcome is informative (INFORMATIVE)
#                        regardless of which branch wins; it's not pass/fail.
# DETECTOR             - verifies the rogue-zero detection machinery works.
#                        PASS = detector armed.
# FALSIFICATION_CONTROL - sanity check that the system can fail on
#                        known-bad data.
ROLE_MAP = {
    "EXP_0":  "DEMONSTRATION",        # legacy axis; canonical is FUNCTION_MAP=VISUALIZATION
    "EXP_1":  "ENABLER",
    "EXP_1B": "FALSIFICATION_CONTROL",
    "EXP_1C": "ENABLER",
    "EXP_2":  "DETECTOR",
    "EXP_2B": "DETECTOR",
    "EXP_3":  "FALSIFICATION_CONTROL",
    "EXP_4":  "PATHFINDER",
    "EXP_5":  "PATHFINDER",
    "EXP_6":  "ENABLER",
    "EXP_7":  "DETECTOR",
    "EXP_8":  "ENABLER",
    "EXP_9":  "DEMONSTRATION",
    "EXP_10": "PATHFINDER",       # legacy axis; canonical FUNCTION_MAP=EXPLORATORY
}


# ============================================================================
# CANONICAL ONTOLOGY (Sprint 2a) — PROOF_PROGRAM_SPEC.md §5/§6/§7
# ============================================================================
# The constants below encode the ontology the spec freezes. `ROLE_MAP` above is
# retained as a deprecation shim; the new canonical axis is FUNCTION_MAP.
# Mappings mirror the provisional witness map in PROOF_PROGRAM_SPEC.md §7.
# GAP_WITNESS_MAP_REVIEW may revise these before Sprint 2b begins UI work.

# Axis A — what job the experiment does in the proof program.
FUNCTION_MAP = {
    "EXP_0":  "VISUALIZATION",            # zeta on critical line; descriptive only, never votes
    "EXP_1":  "PROOF_OBLIGATION_WITNESS", # main Riemann Converter tau-substitution; witnesses OBL_COORD_RECONSTRUCTION_COVARIANCE
    "EXP_1B": "CONTROL",                  # naive operator scaling must break
    "EXP_1C": "RESEARCH_NOTE",            # zero-reuse-across-scales engineering question; not a witness
    "EXP_2":  "EXPLORATORY",              # brittleness — Program 2 only
    "EXP_2B": "EXPLORATORY",              # rogue isolation — Program 2 only
    "EXP_3":  "CONTROL",                  # beta=pi counterfactual must diverge
    "EXP_4":  "PATHFINDER",               # translation vs dilation direction choice
    "EXP_5":  "PATHFINDER",               # lattice-hit / miss direction choice
    "EXP_6":  "PROOF_OBLIGATION_WITNESS", # provisional — beta-invariance witness
    "EXP_7":  "EXPLORATORY",              # calibrated sensitivity — Program 2 only
    "EXP_8":  "PROOF_OBLIGATION_WITNESS", # scaled-zeta zero equivalence; witnesses OBL_ZERO_SCALING_EQUIVALENCE
    "EXP_9":  "DEMONSTRATION",            # bounded-view-corollary demonstration; not a witness
    "EXP_10": "EXPLORATORY",              # zeta-direct gauge transport; Level-4 informational witness
}

# Axis C — kind of claim this result licenses.
EPISTEMIC_LEVEL_MAP = {
    "EXP_0":  "DESCRIPTIVE",
    "EXP_1":  "EMPIRICAL",
    "EXP_1B": "INSTRUMENTAL",
    "EXP_1C": "INSTRUMENTAL",
    "EXP_2":  "EMPIRICAL",
    "EXP_2B": "EMPIRICAL",
    "EXP_3":  "INSTRUMENTAL",
    "EXP_4":  "EMPIRICAL",
    "EXP_5":  "EMPIRICAL",
    "EXP_6":  "EMPIRICAL",
    "EXP_7":  "EMPIRICAL",
    "EXP_8":  "EMPIRICAL",
    "EXP_9":  "INSTRUMENTAL",
    "EXP_10": "EMPIRICAL",
}

# Which named research program each experiment lives in. PROGRAM_1 is direct
# transport; PROGRAM_2 is the Contradiction Track. Program 2 is explicit and
# formalizable, but it remains non-theorem-directed until its blockers close.
# See PROOF_PROGRAM_SPEC.md Decision Log #2.
PROGRAM_MAP = {
    "EXP_0":  "PROGRAM_1",
    "EXP_1":  "PROGRAM_1",
    "EXP_1B": "PROGRAM_1",
    "EXP_1C": "PROGRAM_1",
    "EXP_2":  "PROGRAM_2",
    "EXP_2B": "PROGRAM_2",
    "EXP_3":  "PROGRAM_1",
    "EXP_4":  "PROGRAM_1",
    "EXP_5":  "PROGRAM_1",
    "EXP_6":  "PROGRAM_1",
    "EXP_7":  "PROGRAM_2",
    "EXP_8":  "PROGRAM_1",
    "EXP_9":  "PROGRAM_1",
    "EXP_10": "PROGRAM_1",
}

# Only PROOF_OBLIGATION_WITNESS carries an obligation_id. Provisional per §7.
OBLIGATION_MAP = {
    "EXP_1": "OBL_COORD_RECONSTRUCTION_COVARIANCE",
    "EXP_8": "OBL_ZERO_SCALING_EQUIVALENCE",
    "EXP_6": "OBL_BETA_INVARIANCE",
}

# Exploratory contradiction-track probes are associated with future obligations
# for display/analyzer context, but they are intentionally not witnesses and do
# not carry `obligation_id`.
RELATED_OBLIGATION_MAP = {
    "EXP_2": ["OBL_ROGUE_DETECTABILITY"],
    "EXP_2B": ["OBL_ROGUE_DETECTABILITY", "OBL_NO_HIDING_UNDER_COMPRESSION"],
    "EXP_7": ["OBL_ROGUE_DETECTABILITY", "OBL_NO_HIDING_UNDER_COMPRESSION"],
}

EXPERIMENT_DISPLAY_MAP = {
    "EXP_0": {
        "display_id": "ZETA-0",
        "display_name": "Critical Line Polar Trace",
        "display_group": "ζ-Direct",
        "cli_aliases": ["zeta-0", "polar", "polar-trace"],
    },
    "EXP_1": {
        "display_id": "CORE-1",
        "display_name": "Harmonic Converter",
        "display_group": "Core Calculation",
        "cli_aliases": ["core-1", "harmonic", "harmonic-converter", "converter"],
    },
    "EXP_1B": {
        "display_id": "CTRL-1",
        "display_name": "Operator Scaling Control",
        "display_group": "Controls",
        "cli_aliases": ["ctrl-1", "operator-control", "operator-scaling-control"],
    },
    "EXP_3": {
        "display_id": "CTRL-2",
        "display_name": "Beta Counterfactual Control",
        "display_group": "Controls",
        "cli_aliases": ["ctrl-2", "beta-control", "beta-counterfactual"],
    },
    "EXP_6": {
        "display_id": "VAL-1",
        "display_name": "Beta Stability",
        "display_group": "Validation",
        "cli_aliases": ["val-1", "beta-stability", "beta-validation"],
    },
    "EXP_1C": {
        "display_id": "NOTE-1",
        "display_name": "Zero-Reuse Note",
        "display_group": "Research Notes",
        "cli_aliases": ["note-1", "zero-reuse", "zero-reuse-note"],
    },
    "EXP_4": {
        "display_id": "PATH-1",
        "display_name": "Translation vs Dilation",
        "display_group": "Pathfinders",
        "cli_aliases": ["path-1", "translation-dilation"],
    },
    "EXP_5": {
        "display_id": "PATH-2",
        "display_name": "Zero Correspondence",
        "display_group": "Pathfinders",
        "cli_aliases": ["path-2", "zero-correspondence"],
    },
    "EXP_8": {
        "display_id": "WIT-1",
        "display_name": "Zero Scaling Witness",
        "display_group": "Witnesses",
        "cli_aliases": ["wit-1", "zero-scaling-witness", "reg-1", "scaled-zeta-regression"],
    },
    "EXP_9": {
        "display_id": "DEMO-1",
        "display_name": "Bounded View",
        "display_group": "Demonstrations",
        "cli_aliases": ["demo-1", "bounded-view"],
    },
    "EXP_10": {
        "display_id": "TRANS-1",
        "display_name": "Zeta Gauge Transport",
        "display_group": "ζ-Direct",
        "cli_aliases": ["trans-1", "transport", "zeta-transport"],
    },
    "EXP_2": {
        "display_id": "P2-1",
        "display_name": "Rogue Centrifuge",
        "display_group": "Contradiction Track",
        "cli_aliases": ["p2-1", "rogue-centrifuge"],
    },
    "EXP_2B": {
        "display_id": "P2-2",
        "display_name": "Rogue Isolation",
        "display_group": "Contradiction Track",
        "cli_aliases": ["p2-2", "rogue-isolation"],
    },
    "EXP_7": {
        "display_id": "P2-3",
        "display_name": "Calibrated Amplification",
        "display_group": "Contradiction Track",
        "cli_aliases": ["p2-3", "calibrated-amplification"],
    },
}

WITNESS_MAP_REVIEW_STATUS = "SIGNED_OFF"  # reviewed 2026-04-28; see WITNESS_MAP_REVIEW.md §7
WITNESS_MAP_REVIEW_TEMPLATE = {
    "gate_id": "SPRINT_3B_0_WITNESS_MAP_REVIEW",
    "status": WITNESS_MAP_REVIEW_STATUS,
    "api_contract_ready": True,
    "notes": [
        "Witness map signed off 2026-04-28. Mapping frozen and authoritative.",
        "EXP_6 -> OBL_BETA_INVARIANCE is the sole direct witness.",
        "All other experiments classified as coherence/control/pathfinder/exploratory.",
        "Reviewed against project_alignment.md; all 7 alignment criteria met.",
    ],
}

# Mandatory inference rails (PROOF_PROGRAM_SPEC.md §5/§6). Every experiment's
# record must populate these; disallowed_conclusion must include at least one
# theorem-level overreach disclaimer.
INFERENCE_RAILS = {
    "EXP_0": {
        "inference_scope": "this run, t-range and base specified in config; descriptive only",
        "allowed_conclusion": [
            "Visual representation of zeta(1/2 + i*t) on the critical line at the "
            "declared t-range and sampling resolution.",
            "Loaded zero positions are echoed as origin markers; their visual "
            "alignment with the trace's near-origin loops is a sanity check on "
            "the loaded zero set, not a verification of zero correctness.",
        ],
        "disallowed_conclusion": [
            "The Riemann Hypothesis is true.",
            "The theorem candidate is supported or refuted by this visualization.",
            "Zero positions are verified to ζ(ρ)=0 to any specific precision by this experiment.",
            "Coverage extends beyond the displayed t-range.",
            "The compressed and uncompressed dual-window curves agree exactly under "
            "any non-trivial multiplicative gauge.",
        ],
    },
    "EXP_1": {
        "inference_scope": "this run, tested k-range, AUTHORITATIVE fidelity required",
        "allowed_conclusion": [
            "The explicit-formula reconstruction of pi(X/tau^k) using the un-scaled "
            "zero set tracks the true prime count covariantly across the tested "
            "k-range at AUTHORITATIVE fidelity.",
        ],
        "disallowed_conclusion": [
            "The Riemann Hypothesis is true.",
            "The zero-scaling hypothesis is confirmed.",
            "OBL_COORD_RECONSTRUCTION_COVARIANCE is formally proven.",
            "The RH predicate transports exactly under the gauge.",
            "The theorem candidate is proved.",
            "Coverage extends beyond Odlyzko's verified range.",
        ],
    },
    "EXP_1B": {
        "inference_scope": "this run, naive operator-scaling variant",
        "allowed_conclusion": [
            "The engine detects the wrong group action: naive operator scaling "
            "breaks the reconstruction as expected, arming the gauge claim's "
            "falsifier.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported by this control.",
            "The gauge is correct.",
            "RH is true.",
        ],
    },
    "EXP_1C": {
        "inference_scope": "this run, tested k-range, at declared fidelity; engineering / optimization question only",
        "allowed_conclusion": [
            "At this run's tolerances, multiplying pre-computed un-scaled zeros "
            "by tau^k {does, does not} produce the same reconstruction as recomputing "
            "zeros at the new scale — i.e., zero-reuse-across-scales is/is-not "
            "a viable compute optimization at this fidelity.",
        ],
        "disallowed_conclusion": [
            "This experiment is a witness for any proof obligation.",
            "OBL_ZERO_SCALING_EQUIVALENCE is supported, refuted, or otherwise affected by this result.",
            "The RH predicate transports exactly under the gauge.",
            "The theorem candidate is proved or refuted.",
        ],
    },
    "EXP_2": {
        "inference_scope": "this run, Contradiction Track formalization; planted rogue zero",
        "allowed_conclusion": [
            "Under deep zoom, a planted off-line zero produces visible error "
            "amplification relative to the clean baseline at this run's settings.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported.",
            "No off-line zero exists at arbitrary height.",
            "The Contradiction Track's non-hiding theorem is established.",
            "Contradiction closure is established.",
        ],
    },
    "EXP_2B": {
        "inference_scope": "this run, Contradiction Track formalization; residual isolation",
        "allowed_conclusion": [
            "The residual error scales as x^(0.5+delta) as the single-perturbed-"
            "zero model predicts at this run's settings.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported.",
            "All off-line zeros are isolable in general.",
            "No-hiding under compression is proved.",
        ],
    },
    "EXP_3": {
        "inference_scope": "this run, beta=pi counterfactual control",
        "allowed_conclusion": [
            "The engine detects the counterfactual: beta=pi reconstruction "
            "diverges as expected, arming the beta-invariance claim's falsifier.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported by this control.",
            "beta is invariant.",
        ],
    },
    "EXP_4": {
        "inference_scope": "this run, translation-vs-dilation disambiguation",
        "allowed_conclusion": [
            "Between log-translation and log-dilation, the data prefers the "
            "winning branch at this run's conditions.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported or refuted by this pathfinder.",
            "The chosen direction is correct at untested scales.",
        ],
    },
    "EXP_5": {
        "inference_scope": "this run, nearest-neighbor zero correspondence",
        "allowed_conclusion": [
            "Scaled zeros {lattice-hit, lattice-weak, lattice-path-negative} "
            "under this run's median_z thresholds.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported or refuted by this pathfinder.",
            "The zero-scaling hypothesis is universally confirmed or ruled out.",
        ],
    },
    "EXP_6": {
        "inference_scope": "this run, tested k-range, AUTHORITATIVE fidelity required",
        "allowed_conclusion": [
            "beta_hat(k) = 1/2 to within optimizer tolerance on the tested "
            "k-range at AUTHORITATIVE fidelity.",
        ],
        "disallowed_conclusion": [
            "beta is invariant at untested k.",
            "The RH predicate transports exactly under the gauge.",
            "OBL_BETA_INVARIANCE is formally proven.",
            "The theorem candidate is proved.",
        ],
    },
    "EXP_7": {
        "inference_scope": "this run, Contradiction Track formalization; epsilon-sweep",
        "allowed_conclusion": [
            "The rogue-amplification function A(epsilon) is monotone across "
            "the swept epsilon range at this run's settings.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported.",
            "A non-hiding theorem is established.",
            "Contradiction closure is established.",
        ],
    },
    "EXP_8": {
        "inference_scope": "this run, tested k-range, AUTHORITATIVE fidelity required",
        "allowed_conclusion": [
            "Scaling zeros rho by tau^k produces the same scaled-zeta values "
            "as scaling the prime lattice by tau^k, within adaptive tolerance "
            "at AUTHORITATIVE fidelity on the tested k-range.",
        ],
        "disallowed_conclusion": [
            "The Riemann Hypothesis is true.",
            "OBL_ZERO_SCALING_EQUIVALENCE is formally proven.",
            "The RH predicate transports exactly under the gauge.",
            "The theorem candidate is proved.",
            "Zero-scaling preserves RH-relevant structure (that requires OBL_EXACT_RH_TRANSPORT).",
        ],
    },
    "EXP_9": {
        "inference_scope": "this run, sample of zero heights, bounded-view demonstration",
        "allowed_conclusion": [
            "For each sampled zero, the integer k that brings |gamma * tau^k| "
            "into the target bounded window is computed; this exhibits the "
            "mechanical content of the bounded-view corollary IF transport holds.",
        ],
        "disallowed_conclusion": [
            "Transport is established by this experiment.",
            "The bounded-view corollary is proved.",
            "The theorem candidate is proved or refuted.",
            "Anything about whether the gauge actually preserves RH-relevant structure.",
        ],
    },
    "EXP_10": {
        "inference_scope": (
            "this run, declared bases and k-values, t-window in config; Level-4 "
            "informational witness operating directly on zeta (not on pi_N)."
        ),
        "allowed_conclusion": [
            "At this run's t-window and sampling resolution, |zeta(0.5+it) - "
            "zeta(0.5+i*c^k*t)| is non-zero and varies with base c and exponent k. "
            "The reported per-base, per-k residual statistics quantify how far "
            "zeta is from being multiplicatively gauge-invariant on the tested "
            "interval.",
            "If one base produces systematically smaller residuals than the others, "
            "that is information about which gauge candidate the local zeta "
            "structure least violates — not about which is correct.",
            "The c=1.0001 baseline residual provides a derivative-scale sanity "
            "check on the experiment plumbing (residual at small c-1 should be "
            "approximately |zeta'(s)| * (c-1) * t).",
        ],
        "disallowed_conclusion": [
            "zeta admits a non-trivial multiplicative gauge automorphism.",
            "tau (or any other base tested) is uniquely privileged.",
            "Small residuals at one base imply transport-invariance of the RH "
            "predicate.",
            "The residual decay rate provides a path to a proof.",
            "The theorem candidate is proved or refuted by this experiment.",
        ],
    },
}

# Canonical proof program. Emitted into summary.proof_program on every run.
# Witness lists are filled in from the observed experiments by
# _build_proof_program(). Per-obligation inference.disallowed_conclusion is
# normative — it travels with the data into the API and UI.
PROOF_PROGRAM_TEMPLATE = {
    "theorem_candidate": {
        "formal_statement": (
            "Under the working gauge T_c(s) = s * c^k with c = tau = 2*pi, the "
            "RH predicate is transport-invariant: zeta has a non-trivial zero "
            "rho with Re(rho) != 1/2 iff its image T_c(rho) is likewise off the "
            "critical line. No off-line zero can exist on one side of the gauge "
            "without existing on the other."
        ),
        "bounded_view_corollary": (
            "If exact transport holds, then for any off-line zero rho at "
            "arbitrarily large height, some T_c^k(rho) lands in a bounded "
            "window computable in advance. Checking RH on that window "
            "suffices; unbounded search is logically redundant rather than "
            "mathematically necessary."
        ),
        "plain_language": (
            "If the relevant zeta/prime structure can be transported into a "
            "compressed scale without changing the RH-relevant behavior, then "
            "searching arbitrarily further in the uncompressed scale becomes "
            "logically redundant rather than mathematically necessary."
        ),
        "non_claims": [
            "A formal proof of RH.",
            "Extension of verified ordinate coverage beyond Odlyzko's range.",
            "That numerical equivariance of reconstructions is itself a "
            "transport theorem for the RH predicate.",
            "That tau is the unique multiplicative base for which the "
            "invariance can hold.",
            "That detecting a rogue zero under deep scaling is equivalent to "
            "proving RH before the Contradiction Track's non-hiding and closure "
            "obligations are formalized.",
        ],
        "working_gauge": {"base": "tau = 2*pi", "unique": False},
    },
    "obligations": [
        {
            "id": "OBL_COORD_RECONSTRUCTION_COVARIANCE",
            "title": "Coordinate reconstruction covariance",
            "statement": (
                "Under X -> X/tau^k, the explicit-formula reconstruction of "
                "psi transforms covariantly (modulo subdominant corrections)."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": [],
            "program": "PROGRAM_1",
            "inference": {
                "inference_scope": "Program 1, obligation-level",
                "allowed_conclusion": [
                    "When witnessed, the reconstruction machinery is coherent "
                    "with a covariant coordinate gauge.",
                ],
                "disallowed_conclusion": [
                    "This obligation alone proves the theorem candidate.",
                    "Covariance of reconstructions implies covariance of the "
                    "RH predicate.",
                ],
            },
        },
        {
            "id": "OBL_ZERO_SCALING_EQUIVALENCE",
            "title": "Zero scaling equivalence",
            "statement": (
                "Scaling zeros rho by tau^k is isometric to scaling the prime "
                "lattice by tau^k in the reconstruction."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": ["OBL_COORD_RECONSTRUCTION_COVARIANCE"],
            "program": "PROGRAM_1",
            "inference": {
                "inference_scope": "Program 1, obligation-level",
                "allowed_conclusion": [
                    "When witnessed, the zero-scaling identity holds numerically "
                    "within the tested drift/ratio tolerances.",
                ],
                "disallowed_conclusion": [
                    "This obligation alone proves the theorem candidate.",
                    "Numerical isometry implies exact analytic transport.",
                ],
            },
        },
        {
            "id": "OBL_BETA_INVARIANCE",
            "title": "Beta invariance under the gauge",
            "statement": (
                "The best-fit critical-line parameter beta_hat(k) equals 1/2 "
                "across the tested k-family, to within optimizer tolerance."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": ["OBL_ZERO_SCALING_EQUIVALENCE"],
            "program": "PROGRAM_1",
            "inference": {
                "inference_scope": "Program 1, obligation-level",
                "allowed_conclusion": [
                    "When witnessed at AUTHORITATIVE fidelity, the recovered "
                    "critical-line parameter is empirically invariant on the "
                    "tested k-range.",
                ],
                "disallowed_conclusion": [
                    "This obligation alone proves the theorem candidate.",
                    "beta is invariant at untested k.",
                    "The RH predicate transports exactly.",
                ],
            },
        },
        {
            "id": "OBL_EXACT_RH_TRANSPORT",
            "title": "Exact transport of the RH predicate",
            "statement": (
                "The RH predicate itself (not merely the reconstruction, not "
                "merely the zeros, not merely the beta fit) transports exactly "
                "under T_c."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": [
                "OBL_COORD_RECONSTRUCTION_COVARIANCE",
                "OBL_ZERO_SCALING_EQUIVALENCE",
                "OBL_BETA_INVARIANCE",
            ],
            "program": "PROGRAM_1",
            "inference": {
                "inference_scope": "Program 1, the load-bearing obligation",
                "allowed_conclusion": [
                    "This obligation has no empirical witness; it is a "
                    "theorem-level claim awaiting a proof artifact.",
                ],
                "disallowed_conclusion": [
                    "Numerical witnesses of other obligations suffice to "
                    "establish this one.",
                ],
            },
        },
        {
            "id": "OBL_ROGUE_DETECTABILITY",
            "title": "Rogue-zero detectability (Contradiction Track)",
            "statement": (
                "Any off-line zero within the covered ordinate range produces "
                "an amplification signature that is finite-k-detectable under "
                "the gauge."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": [],
            "program": "PROGRAM_2",
            "inference": {
                "inference_scope": "Contradiction Track, obligation-level; formalization required",
                "allowed_conclusion": [
                    "When formalized, rogue/off-line zeros produce an amplifying "
                    "signature that the detector can expose at finite k.",
                ],
                "disallowed_conclusion": [
                    "This obligation alone proves the theorem candidate.",
                    "A non-hiding theorem is established by these witnesses.",
                    "The Contradiction Track is closed.",
                ],
            },
        },
        {
            "id": "OBL_NO_HIDING_UNDER_COMPRESSION",
            "title": "No hiding under compression (Contradiction Track)",
            "statement": (
                "Compression by tau^k cannot move an off-line zero outside every "
                "bounded/verified view needed by the contradiction argument."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": ["OBL_ROGUE_DETECTABILITY"],
            "program": "PROGRAM_2",
            "inference": {
                "inference_scope": "Contradiction Track, non-hiding theorem",
                "allowed_conclusion": [
                    "When formalized, a rogue zero cannot evade the compressed "
                    "bounded view by moving to an untested scale or window.",
                ],
                "disallowed_conclusion": [
                    "Finite numerical sweeps prove no-hiding at arbitrary height.",
                    "The theorem candidate is proved.",
                ],
            },
        },
        {
            "id": "OBL_CONTRADICTION_CLOSURE",
            "title": "Contradiction closure",
            "statement": (
                "Rogue detectability plus no-hiding under compression plus a "
                "verified bounded view yields the contradiction needed to close "
                "the alternative proof route."
            ),
            "status": "CONJECTURAL",
            "witnesses": [],
            "depends_on": [
                "OBL_ROGUE_DETECTABILITY",
                "OBL_NO_HIDING_UNDER_COMPRESSION",
            ],
            "program": "PROGRAM_2",
            "inference": {
                "inference_scope": "Contradiction Track closure",
                "allowed_conclusion": [
                    "When formalized, the contradiction route has a closed "
                    "logical bridge from detectable rogue behavior to the theorem target.",
                ],
                "disallowed_conclusion": [
                    "Detectability experiments alone close the proof.",
                    "Exact RH transport is proved by contradiction-track numerics.",
                    "The theorem candidate is proved without a formal closure artifact.",
                ],
            },
        },
    ],
    "open_gaps": [
        {
            "id": "GAP_RH_PREDICATE_TRANSPORT",
            "title": "Exact transport of the RH predicate",
            "description": (
                "Exact transport of the RH predicate under the gauge is not "
                "proved, only witnessed."
            ),
            "blocker_for": ["OBL_EXACT_RH_TRANSPORT"],
        },
        {
            "id": "GAP_TAU_UNIQUENESS",
            "title": "Uniqueness of tau as the gauge base",
            "description": (
                "Whether tau is structurally singled out, or whether any c > 1 "
                "would serve. Not a proof obligation — a parked research "
                "question outside the critical path."
            ),
        },
        {
            "id": "GAP_NO_HIDING_UNDER_COMPRESSION",
            "title": "No hiding under compression",
            "description": (
                "Heuristic argument that a rogue zero at ordinate ~10^9999 "
                "cannot hide under compression; no formal non-hiding theorem."
            ),
            "blocker_for": ["OBL_NO_HIDING_UNDER_COMPRESSION"],
        },
        {
            "id": "GAP_PROGRAM2_FORMALIZATION",
            "title": "Formal detectability theorem for the Contradiction Track",
            "description": (
                "The contradiction-by-detectability route lacks a formal "
                "amplification theorem."
            ),
            "blocker_for": ["OBL_ROGUE_DETECTABILITY"],
        },
        {
            "id": "GAP_CONTRADICTION_CLOSURE",
            "title": "Contradiction closure proof",
            "description": (
                "The contradiction route lacks a formal closure artifact showing "
                "that detectability plus no-hiding plus a verified bounded view "
                "forces the intended contradiction."
            ),
            "blocker_for": ["OBL_CONTRADICTION_CLOSURE"],
        },
        {
            "id": "GAP_WITNESS_MAP_REVIEW",
            "title": "Provisional witness map",
            "description": (
                "The mapping of experiments to obligations (PROOF_PROGRAM_SPEC "
                "§7) is provisional. Sprint 3b.0 witness-map review must be "
                "signed off before API/schema contracts treat witness mappings "
                "as authoritative."
            ),
        },
    ],
}


def _outcome_from_status(status, function):
    """Translate a mechanical status + canonical function into a canonical
    ExperimentOutcome. Replaces _theory_fit()'s SUPPORTS/REFUTES vocabulary on
    the new axis. See PROOF_PROGRAM_SPEC.md §5.

    Polarity rules by function:
      CONTROL / REGRESSION_CHECK:
        PASS -> IMPLEMENTATION_OK (falsifier armed / identity holds)
        FAIL -> IMPLEMENTATION_BROKEN
      PATHFINDER:
        any decisive status -> DIRECTIONAL (branch name goes in `direction`)
      CORE_CALCULATION / PROOF_OBLIGATION_WITNESS / COHERENCE_WITNESS / EXPLORATORY / THEOREM_STATEMENT:
        PASS -> CONSISTENT
        FAIL -> INCONSISTENT
        NOTEWORTHY/WARN -> CONSISTENT (partial but non-contradicting)
    """
    if function in ("CONTROL", "REGRESSION_CHECK"):
        if status == "PASS":
            return "IMPLEMENTATION_OK"
        if status == "FAIL":
            return "IMPLEMENTATION_BROKEN"
        return "INCONCLUSIVE"
    if function == "PATHFINDER":
        if status in ("PASS", "FAIL", "NOTEWORTHY", "WARN"):
            return "DIRECTIONAL"
        return "INCONCLUSIVE"
    if function == "RESEARCH_NOTE":
        # RESEARCH_NOTE results are informational — they describe an engineering
        # / optimization question, not a witness for any obligation. The status
        # records the underlying mechanical outcome but the canonical outcome
        # is always INFORMATIONAL.
        return "INFORMATIONAL"
    if function == "DEMONSTRATION":
        # DEMONSTRATION results show what the corollary's mechanics would
        # produce IF transport holds. They are not witnesses; outcome is always
        # INFORMATIONAL.
        return "INFORMATIONAL"
    if function == "VISUALIZATION":
        # VISUALIZATION results display the analytic object the gauge is
        # conjectured to act on (e.g., zeta on the critical line). They are
        # purely descriptive — never witnesses, never refutations.
        return "INFORMATIONAL"
    # WITNESS, EXPLORATORY, THEOREM_STATEMENT
    if status == "PASS":
        return "CONSISTENT"
    if status == "FAIL":
        return "INCONSISTENT"
    if status in ("NOTEWORTHY", "WARN"):
        return "CONSISTENT"
    return "INCONCLUSIVE"


def _build_experiment_classification():
    """Canonical single-source-of-truth classification table, emitted into
    `meta.experiment_classification`. UI code (ExperimentSidebar etc.) should
    read from this map instead of hardcoding a ROLE_MAP duplicate.
    """
    out = {}
    all_ids = set(FUNCTION_MAP) | set(ROLE_MAP) | set(STAGE_MAP)
    for exp_id in sorted(all_ids):
        entry = {
            "stable_id": exp_id,
            "function": FUNCTION_MAP.get(exp_id, "EXPLORATORY"),
            "role": ROLE_MAP.get(exp_id),
            "stage": STAGE_MAP.get(exp_id, "unknown"),
            "program": PROGRAM_MAP.get(exp_id, "PROGRAM_1"),
            "epistemic_level": EPISTEMIC_LEVEL_MAP.get(exp_id, "EMPIRICAL"),
            "inference": INFERENCE_RAILS.get(exp_id, {
                "inference_scope": "unspecified",
                "allowed_conclusion": [],
                "disallowed_conclusion": ["The theorem candidate is proved."],
            }),
        }
        entry.update(EXPERIMENT_DISPLAY_MAP.get(exp_id, {}))
        if exp_id in RELATED_OBLIGATION_MAP:
            entry["related_obligation_ids"] = RELATED_OBLIGATION_MAP[exp_id]
        if exp_id in OBLIGATION_MAP:
            entry["obligation_id"] = OBLIGATION_MAP[exp_id]
            if WITNESS_MAP_REVIEW_STATUS != "SIGNED_OFF":
                entry["mapping_provisional"] = True
        out[exp_id] = entry
    return out


def _topological_order(obligations):
    """Return obligation IDs in dependency order (foundations first). Raise
    ValueError on cycles so the ladder cannot silently produce garbage."""
    by_id = {obl["id"]: obl for obl in obligations}
    order = []
    visiting = set()
    visited = set()

    def visit(obl_id, stack):
        if obl_id in visited:
            return
        if obl_id in visiting:
            cycle = " -> ".join(stack + [obl_id])
            raise ValueError(f"depends_on cycle in proof program: {cycle}")
        if obl_id not in by_id:
            # depends_on points outside the obligation set — tolerated; caller
            # will surface it as an unmet prereq during BLOCKED computation.
            return
        visiting.add(obl_id)
        for dep in by_id[obl_id].get("depends_on") or []:
            visit(dep, stack + [obl_id])
        visiting.discard(obl_id)
        visited.add(obl_id)
        order.append(obl_id)

    for obl in obligations:
        visit(obl["id"], [])
    return order


def _build_proof_program(
    experiments,
    fidelity_tier,
    witness_map_review_status=None,
    has_formal_proof_artifact=None,
):
    """Return a fresh ProofProgram object with per-obligation ladder status
    computed from (witness-map sign-off, fidelity tier, depends_on edges, and
    GAP.blocker_for edges). Status is one of PROVEN | WITNESSED | CONJECTURAL
    | BLOCKED (PROOF_TARGET.md, plan Phase B.4).

    Rules (evaluated in this order per obligation, in topological order):
      1. PROVEN iff a formal proof artifact is recorded for this obligation.
      2. WITNESSED iff witness-map review is SIGNED_OFF AND fidelity is
         AUTHORITATIVE AND at least one PROOF_OBLIGATION_WITNESS bearing on
         this obligation produced a CONSISTENT outcome.
      3. BLOCKED iff any depends_on prereq is not WITNESSED|PROVEN, OR any
         open_gap names this obligation in blocker_for. `blocked_by` lists the
         unmet prereqs and the blocking gap IDs.
      4. CONJECTURAL otherwise (default).

    Parameters `witness_map_review_status` and `has_formal_proof_artifact` are
    injectable for testing; when omitted they fall back to module state
    (WITNESS_MAP_REVIEW_STATUS) and to `lambda _id: False` respectively.
    """
    prog = copy.deepcopy(PROOF_PROGRAM_TEMPLATE)
    review = copy.deepcopy(WITNESS_MAP_REVIEW_TEMPLATE)

    if witness_map_review_status is None:
        witness_map_review_status = WITNESS_MAP_REVIEW_STATUS
    if has_formal_proof_artifact is None:
        has_formal_proof_artifact = lambda _obl_id: False  # noqa: E731

    frozen_mapping = {}
    provisional_experiments = []
    unmapped_witness_candidates = []
    for exp_id, entry in experiments.items():
        if entry.get("function") != "PROOF_OBLIGATION_WITNESS":
            continue
        obligation_id = entry.get("obligation_id")
        frozen_mapping[exp_id] = obligation_id
        provisional_experiments.append(exp_id)
        if not obligation_id:
            unmapped_witness_candidates.append(exp_id)

    review["frozen_mapping"] = {"experiment_to_obligation": frozen_mapping}
    review["provisional_experiments"] = sorted(provisional_experiments)
    if unmapped_witness_candidates:
        review["unmapped_witness_candidates"] = sorted(unmapped_witness_candidates)

    by_id = {obl["id"]: obl for obl in prog["obligations"]}
    order = _topological_order(prog["obligations"])

    for obl_id in order:
        obl = by_id[obl_id]

        any_witnesses = []
        consistent_witnesses = []
        for exp_id, entry in experiments.items():
            if entry.get("function") != "PROOF_OBLIGATION_WITNESS":
                continue
            if entry.get("obligation_id") != obl_id:
                continue
            any_witnesses.append(exp_id)
            if entry.get("outcome") == "CONSISTENT" and not entry.get("provisional"):
                consistent_witnesses.append(exp_id)
        obl["witnesses"] = any_witnesses
        if any_witnesses and witness_map_review_status != "SIGNED_OFF":
            note = (
                "Witness mapping is provisional pending Sprint 3b.0 "
                "GAP_WITNESS_MAP_REVIEW sign-off."
            )
            prior = obl.get("notes")
            obl["notes"] = f"{prior} {note}".strip() if prior else note

        # Resolve ladder status in priority order.
        if has_formal_proof_artifact(obl_id):
            obl["status"] = "PROVEN"
            obl["blocked_by"] = []
            continue
        if (
            witness_map_review_status == "SIGNED_OFF"
            and fidelity_tier == "AUTHORITATIVE"
            and consistent_witnesses
        ):
            obl["status"] = "WITNESSED"
            obl["blocked_by"] = []
            continue

        unmet_prereqs = [
            dep
            for dep in (obl.get("depends_on") or [])
            if by_id.get(dep, {}).get("status") not in ("WITNESSED", "PROVEN")
        ]
        blocking_gaps = [
            gap["id"]
            for gap in prog["open_gaps"]
            if obl_id in (gap.get("blocker_for") or [])
        ]
        blocked_by = unmet_prereqs + blocking_gaps
        if blocked_by:
            obl["status"] = "BLOCKED"
            obl["blocked_by"] = blocked_by
        else:
            obl["status"] = "CONJECTURAL"
            obl["blocked_by"] = []

    prog["witness_map_review"] = review
    return prog


# DEPRECATED (PROOF_PROGRAM_SPEC.md §6): _theory_fit() mints a theory verdict
# (SUPPORTS/REFUTES/CANDIDATE/INFORMATIVE/CONTROL_BROKEN) from a mechanical
# status. The new canonical axis is `function` + `outcome` via
# _outcome_from_status(); every experiment's inference.disallowed_conclusion
# documents what may NOT be inferred from its result.
#
# This function is retained for one release as a backward-compat shim so the
# current dashboard (StageBanner, ExperimentSidebar badges) continues to
# render during migration. Sprint 2b rewrites the consuming UI and this
# function is removed.
#
# Polarity rules (historical, preserved for the shim):
#   FALSIFICATION_CONTROL: PASS -> SUPPORTS, FAIL -> CONTROL_BROKEN
#   PATHFINDER: any decisive outcome -> INFORMATIVE
#   ENABLER / DETECTOR: PASS -> SUPPORTS, FAIL -> REFUTES
def _theory_fit(status, type_str, role=None):
    if type_str == "FALSIFICATION_CONTROL" or role == "FALSIFICATION_CONTROL":
        if status == "PASS":
            return "SUPPORTS"
        if status == "FAIL":
            return "CONTROL_BROKEN"
        return "INCONCLUSIVE"
    if role == "PATHFINDER":
        if status in ("PASS", "FAIL", "NOTEWORTHY", "WARN"):
            return "INFORMATIVE"
        return "INCONCLUSIVE"
    if status == "PASS":
        return "SUPPORTS"
    if status == "FAIL":
        return "REFUTES"
    if status == "NOTEWORTHY":
        return "CANDIDATE"
    if status == "WARN":
        return "CANDIDATE"
    return "INCONCLUSIVE"


def run_verification(data=None, progress_callback=None, emit_run_events=False):
    progress_seen = set()
    progress_total = len(VERIFICATION_EXPERIMENT_IDS)
    verify_started = time.time()

    def report_progress(exp_id=None, status=None, message=None):
        if exp_id and exp_id in VERIFICATION_EXPERIMENT_IDS:
            progress_seen.add(exp_id)
        completed = len(progress_seen)
        payload = {"exp_id": exp_id, "status": status} if exp_id else {"status": status}
        if callable(progress_callback):
            progress_callback(completed, progress_total, message=message, payload=payload)
        emit_run_event(
            emit_run_events,
            kind="PROGRESS",
            phase="VERIFY",
            state="heartbeat",
            message=message or "verifier progress",
            completed_units=completed,
            total_units=progress_total,
            percent=80 + (15 * (completed / max(1, progress_total))),
            payload=payload,
        )

    emit_run_event(
        emit_run_events,
        kind="PHASE",
        phase="VERIFY",
        state="start",
        message="Verifier started",
        completed_units=0,
        total_units=progress_total,
        percent=80,
    )
    report_progress(message="Verifier bootstrapped")

    if data is None:
        if not os.path.exists(OUTPUT_FILE):
            print(" [NO] Data file not found. Run the engine first.")
            return None
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

    print("\n" + "="*75)
    print(f" [VERIFIER] AUTOMATED HYPOTHESIS VERIFIER (schema {EXPECTED_SCHEMA_VERSION}) ")
    print("="*75)

    observed_schema = data.get("meta", {}).get("schema_version")
    if observed_schema != EXPECTED_SCHEMA_VERSION:
        print(
            f" [SCHEMA MISMATCH] artifact declares '{observed_schema}', "
            f"verifier expects '{EXPECTED_SCHEMA_VERSION}'. Refusing to grade."
        )
        data["summary"] = {
            "engine_status": "SCHEMA_MISMATCH",
            "overall": "SKIP",
            "expected_schema_version": EXPECTED_SCHEMA_VERSION,
            "observed_schema_version": observed_schema,
            "experiments": {},
            "stage_verdicts": {},
        }
        report_progress(message="schema mismatch; verification skipped", status="SKIP")
        emit_run_event(
            emit_run_events,
            kind="PHASE",
            phase="VERIFY",
            state="done",
            message="Verifier done (schema mismatch)",
            completed_units=progress_total,
            total_units=progress_total,
            percent=95,
            payload={"phase_duration_seconds": time.time() - verify_started},
        )
        return data

    fidelity_zeros = data.get("meta", {}).get("zeros")
    fidelity_dps = data.get("meta", {}).get("dps")
    fidelity_tier = compute_fidelity_tier(fidelity_zeros, fidelity_dps)
    print(
        f" [FIDELITY] tier={fidelity_tier}  "
        f"zeros={fidelity_zeros}  dps={fidelity_dps}"
    )

    summary = {
        "engine_status": "OK",
        # `overall` is a deprecated project-wide theory verdict (see
        # PROOF_PROGRAM_SPEC.md Decision Log #6). Retained for one release so
        # the current StageBanner keeps rendering; Sprint 2b removes its use.
        "overall": "PASS",
        "schema_version": EXPECTED_SCHEMA_VERSION,
        "fidelity_tier": fidelity_tier,
        "fidelity_zeros": fidelity_zeros,
        "fidelity_dps": fidelity_dps,
        "experiments": {},
    }

    def log_result(exp_id, type_str, status, metric_summary, interpretation):

        # --- Canonical axes (Sprint 2a) ---------------------------------------
        function = FUNCTION_MAP.get(exp_id, "EXPLORATORY")
        epistemic_level = EPISTEMIC_LEVEL_MAP.get(exp_id, "EMPIRICAL")
        program = PROGRAM_MAP.get(exp_id, "PROGRAM_1")
        inference = INFERENCE_RAILS.get(exp_id, {
            "inference_scope": "unspecified",
            "allowed_conclusion": [],
            "disallowed_conclusion": ["The theorem candidate is proved."],
        })
        obligation_id = OBLIGATION_MAP.get(exp_id)
        outcome = _outcome_from_status(status, function)
        mapping_provisional = (
            function == "PROOF_OBLIGATION_WITNESS"
            and obligation_id is not None
            and WITNESS_MAP_REVIEW_STATUS != "SIGNED_OFF"
        )

        # --- Legacy axes (deprecation shim; UI still reads these) -------------
        stage = STAGE_MAP.get(exp_id, "unknown")
        role = ROLE_MAP.get(exp_id, "UNKNOWN")
        fit = _theory_fit(status, type_str, role)

        # --- Fidelity-floor policy --------------------------------------------
        # Clamp applies to WITNESS + EXPLORATORY only. CONTROL, PATHFINDER, and
        # REGRESSION_CHECK are fidelity-independent: a control must arm
        # regardless of N, a pathfinder compares two models on the same data,
        # and a regression check is engine-health plumbing. The clamp is now
        # function-driven — no legacy-role fallback, since FUNCTION_MAP is
        # complete for every experiment in the registry.
        provisional = False
        clamped_note = None
        fidelity_sensitive_functions = (
            "PROOF_OBLIGATION_WITNESS", "COHERENCE_WITNESS", "EXPLORATORY"
        )
        if function in fidelity_sensitive_functions:
            if fidelity_tier == "SMOKE":
                if fit != "INCONCLUSIVE" or outcome != "INCONCLUSIVE":
                    clamped_note = (
                        f"[SMOKE tier: verdict suppressed below declared fidelity floor; "
                        f"mechanical status '{status}' retained]"
                    )
                    fit = "INCONCLUSIVE"
                    outcome = "INCONCLUSIVE"
            elif fidelity_tier == "STANDARD" and function == "PROOF_OBLIGATION_WITNESS":
                provisional = True

        print(
            f"\n[{exp_id}] ({stage}/{function}) {type_str}: {status}  "
            f"[outcome={outcome}, theory_fit={fit}"
            f"{', provisional' if provisional else ''}]"
        )
        print(f"  > Metrics: {metric_summary}")
        if clamped_note:
            print(f"  > Note: {clamped_note}")
        print(f"  > Interpretation: {interpretation}")

        final_interp = (
            f"{interpretation} {clamped_note}".strip() if clamped_note else interpretation
        )

        # `direction` is populated by pathfinders into `metrics.direction`
        # today; surface it at the record level so UI consumers can read it
        # without inspecting the metrics blob.
        direction = None
        if isinstance(metric_summary, dict):
            raw_dir = metric_summary.get("direction")
            if isinstance(raw_dir, str):
                direction = raw_dir

        entry = {
            # === Canonical axes (PROOF_PROGRAM_SPEC.md §5/§6) =================
            "function": function,
            "outcome": outcome,
            "epistemic_level": epistemic_level,
            "inference": inference,
            "program": program,

            # === Preserved fields =============================================
            "stage": stage,
            "type": type_str,
            "status": status,
            "metrics": metric_summary,
            "interpretation": final_interp,

            # === Deprecation shims (retained for one release) =================
            "role": role,
            "theory_fit": fit,
        }
        entry["stable_id"] = exp_id
        entry.update(EXPERIMENT_DISPLAY_MAP.get(exp_id, {}))
        if obligation_id:
            entry["obligation_id"] = obligation_id
            if mapping_provisional:
                entry["mapping_provisional"] = True
        if exp_id in RELATED_OBLIGATION_MAP:
            entry["related_obligation_ids"] = RELATED_OBLIGATION_MAP[exp_id]
        if direction:
            entry["direction"] = direction
        if provisional:
            entry["provisional"] = True
        summary["experiments"][exp_id] = entry
        if exp_id not in progress_seen:
            report_progress(
                exp_id=exp_id,
                status=status,
                message=f"Verifier graded {exp_id}",
            )


    def is_number(x):
        return isinstance(x, (int, float)) and math.isfinite(x)

    # =========================================================================
    # EXP 0: ZETA POLAR TRACE (Visualization) -> DESCRIPTIVE
    # =========================================================================
    # VISUALIZATION function: descriptive only, never votes. Status reflects
    # whether the artifact is well-formed (sample arrays present and non-empty),
    # not anything theory-relevant.
    exp0 = data.get("experiment_0", {})
    if isinstance(exp0, dict) and "polar_trace" in exp0:
        polar = exp0.get("polar_trace") or {}
        dual = exp0.get("dual_window") or {}
        polar_samples = polar.get("samples") or []
        zero_markers = polar.get("zero_markers") or []
        dual_uncomp = dual.get("uncompressed") or []
        dual_comp = dual.get("compressed") or []
        if polar_samples and dual_uncomp and dual_comp:
            status = "PASS"
            interp = (
                f"Polar trace rendered with {len(polar_samples)} samples and "
                f"{len(zero_markers)} zero markers in range. Dual-window overlay "
                f"rendered with {len(dual_uncomp)} samples per window."
            )
        else:
            status = "INSUFFICIENT_DATA"
            interp = (
                f"EXP_0 artifact missing data: polar_samples={len(polar_samples)}, "
                f"zero_markers={len(zero_markers)}, dual_uncomp={len(dual_uncomp)}, "
                f"dual_comp={len(dual_comp)}."
            )
        log_result(
            "EXP_0",
            "DEMONSTRATION",  # type_str (legacy axis); FUNCTION_MAP handles the canonical axis
            status,
            {
                "polar_sample_count": len(polar_samples),
                "zero_markers_in_range": len(zero_markers),
                "dual_window_sample_count": len(dual_uncomp),
                "dual_window_config": dual.get("config", {}),
                "polar_config": polar.get("config", {}),
            },
            interp,
        )
    else:
        log_result("EXP_0", "DEMONSTRATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # CORE-1: HARMONIC CONVERTER -> CORE_CALCULATION
    # =========================================================================
    # Earlier kernels had `eff_X = x_vis / scale` which cancelled the gauge
    # transformation, forcing y_rec to be byte-identical across k and making
    # any cross-k drift metric trivially zero. The honest metric is the
    # reconstruction-vs-truth error at each (k, x), where both sides are
    # evaluated at the SAME scaled coordinate using the un-scaled zero set.
    exp1 = data.get("experiment_1", {})
    if "0" in exp1:
        max_drift = 0.0
        per_k_max = {}
        scales_analyzed = []

        for k_str, k_data in exp1.items():
            scales_analyzed.append(k_str)
            k_max = 0.0
            for p in k_data:
                if not (is_number(p.get("y_rec")) and is_number(p.get("y_true"))):
                    continue
                err = abs(p["y_rec"] - p["y_true"])
                if err > k_max:
                    k_max = err
            per_k_max[k_str] = k_max
            if k_max > max_drift:
                max_drift = k_max

        # Threshold: pre-rebuild was 1e-9 against a tautological metric.
        # Post-rebuild we are measuring genuine reconstruction-vs-truth error
        # at scaled coordinates with finite N zeros and a static Mobius
        # schedule (m in {1,2,3,5,6,7}), so a small but nonzero floor is
        # expected. The 1.0 threshold is a sanity sentinel until the
        # empirical noise floor at AUTHORITATIVE fidelity is characterized
        # (see PROOF_TARGET.md follow-up: EXP_1 threshold calibration).
        if max_drift < 1.0:
            status = "PASS"
            interp = (
                "Reconstruction at scaled coordinates tracks the prime count using "
                "the un-scaled zero set (scaled-coordinate stress remains within the "
                "current sentinel threshold)."
            )
        else:
            status = "FAIL"
            interp = (
                "Reconstruction at scaled coordinates does not track the prime count "
                "using the un-scaled zero set — scaled-coordinate stress breaks beyond the "
                "sanity sentinel."
            )

        log_result(
            "EXP_1",
            "VALIDATION",
            status,
            {"max_drift": max_drift, "per_k_max": per_k_max, "scales": scales_analyzed},
            interp,
        )
    else:
        if not (isinstance(exp1, dict) and "main" in exp1):
            log_result("EXP_1", "VALIDATION", "SKIP", {}, "Missing Data")

    # Canonical CORE-1 artifact shape. This overwrites the supporting-stress
    # fallback record above when the main Riemann Converter branch is present.
    exp1_main = exp1.get("main", {}) if isinstance(exp1, dict) else {}
    exp1_by_k = exp1_main.get("by_k", {}) if isinstance(exp1_main, dict) else {}
    exp1_metrics = exp1_main.get("metrics", {}) if isinstance(exp1_main, dict) else {}
    if isinstance(exp1_by_k, dict) and exp1_by_k.get("0"):
        max_harmonic_drift = exp1_metrics.get("max_harmonic_drift_vs_k0")
        max_mobius_drift = exp1_metrics.get("max_mobius_drift_vs_k0")
        max_true_drift = exp1_metrics.get("max_y_true_drift_vs_k0")
        scales_analyzed = sorted(exp1_by_k.keys(), key=lambda item: float(item))
        stress = exp1.get("support", {}).get("scaled_coordinate_stress", {}) if isinstance(exp1, dict) else {}
        stress_metrics = stress.get("metrics", {}) if isinstance(stress, dict) else {}

        if not is_number(max_harmonic_drift) or not is_number(max_mobius_drift) or not is_number(max_true_drift):
            status = "INSUFFICIENT_DATA"
            interp = "EXP_1 main branch is present but lacks numeric tau-substitution drift metrics."
        elif max(max_harmonic_drift, max_mobius_drift, max_true_drift) <= 1e-9:
            status = "PASS"
            interp = (
                "Main Riemann Converter curves are invariant under x_eff = X/tau^k "
                "on the tested grid. Reconstruction accuracy is reported separately "
                "as supporting validation, not as an RH or zero-scaling proof."
            )
        else:
            status = "FAIL"
            interp = (
                "Main Riemann Converter curves drift under x_eff = X/tau^k on the "
                "tested grid; the core tau-substitution calculation is not invariant "
                "at this fidelity."
            )

        log_result(
            "EXP_1",
            "CORE_CALCULATION",
            status,
            {
                "max_harmonic_drift_vs_k0": max_harmonic_drift,
                "max_mobius_drift_vs_k0": max_mobius_drift,
                "max_y_true_drift_vs_k0": max_true_drift,
                "main_metrics": exp1_metrics,
                "support_scaled_coordinate_stress": stress_metrics,
                "scales": scales_analyzed,
            },
            interp,
        )

    # =========================================================================
    # EXP 1B: OPERATOR GAUGE (Falsification) -> FALSIFICATION_CONTROL
    # =========================================================================
    exp1b = data.get("experiment_1b", {}).get("variants", {})
    gamma_scaled = exp1b.get("gamma_scaled") if isinstance(exp1b, dict) else None
    if isinstance(gamma_scaled, dict) and gamma_scaled.get("0"):
        base = gamma_scaled.get("0", [])
        max_drift = 0.0
        comparisons = 0
        for k, pts in gamma_scaled.items():
            if k == "0": continue
            for p_base, p_k in zip(base, pts):
                drift = abs(p_base["y_rec"] - p_k["y_rec"])
                max_drift = max(max_drift, drift)
                comparisons += 1

        if comparisons == 0:
            log_result("EXP_1B", "FALSIFICATION_CONTROL", "INSUFFICIENT_DATA", {}, "No comparison rows.")
        else:
            # Ratio-based divergence test: compare drift against baseline
            # reconstruction amplitude. Any detectable relative divergence
            # means the wrong group action broke the reconstruction —
            # the control is armed.
            baseline_amplitude = max(
                (abs(p["y_rec"]) for p in base), default=1.0
            )
            relative_divergence = max_drift / max(baseline_amplitude, 1e-15)

            if relative_divergence > 0.01:
                status = "PASS"
                interp = (
                    f"Control armed: naive gamma scaling diverges from baseline "
                    f"by {relative_divergence:.1%} (max_drift={max_drift:.4g} vs "
                    f"baseline_amplitude={baseline_amplitude:.4g})."
                )
            else:
                status = "FAIL"
                interp = (
                    f"Control NOT armed: naive gamma scaling matches baseline "
                    f"within {relative_divergence:.1%} — expected divergence "
                    f"not detected."
                )

            log_result(
                "EXP_1B", "FALSIFICATION_CONTROL", status,
                {
                    "max_drift": max_drift,
                    "baseline_amplitude": baseline_amplitude,
                    "relative_divergence": relative_divergence,
                },
                interp,
            )
    else:
        log_result("EXP_1B", "FALSIFICATION_CONTROL", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 1C: ZERO SCALING (Tau-Lattice) -> HYPOTHESIS_TEST
    # Pass Condition (MATH_README):
    #   Drift <= 0.25 AND (Operator Error / Baseline Error) <= 1.10
    # =========================================================================
    exp1c = data.get("experiment_1c", {})
    if exp1c:
        drifts = []
        ratios = []
        scales_used = []

        for k, rows in exp1c.items():
            if not isinstance(rows, list) or not rows:
                continue

            max_drift_k = 0.0
            max_coord_err_k = 0.0
            max_op_err_k = 0.0
            valid_count = 0

            for row in rows:
                y_coord = row.get("y_coord")
                y_op = row.get("y_op")
                y_true = row.get("y_true")
                if not (is_number(y_coord) and is_number(y_op) and is_number(y_true)):
                    continue

                valid_count += 1
                drift = abs(y_op - y_coord)
                coord_err = abs(y_coord - y_true)
                op_err = abs(y_op - y_true)

                if drift > max_drift_k:
                    max_drift_k = drift
                if coord_err > max_coord_err_k:
                    max_coord_err_k = coord_err
                if op_err > max_op_err_k:
                    max_op_err_k = op_err

            if valid_count == 0:
                continue

            ratio_k = (max_op_err_k / max_coord_err_k) if max_coord_err_k > 0 else (1.0 if max_op_err_k == 0 else math.inf)
            drifts.append(max_drift_k)
            ratios.append(ratio_k)
            scales_used.append(k)

        if not drifts:
            log_result(
                "EXP_1C",
                "HYPOTHESIS_TEST",
                "INSUFFICIENT_DATA",
                {},
                "No valid numeric rows to evaluate drift/ratio."
            )
        else:
            worst_drift = max(drifts)
            worst_ratio = max(ratios)
            pass_drift = worst_drift <= 0.25
            pass_ratio = worst_ratio <= 1.10

            if pass_drift and pass_ratio:
                status = "PASS"
                interp = "Zero-scaling hypothesis is supported within documented drift/ratio tolerances."
            else:
                status = "FAIL"
                interp = "Zero-scaling hypothesis fails documented tolerances (drift and/or error-ratio)."

            log_result(
                "EXP_1C",
                "HYPOTHESIS_TEST",
                status,
                {
                    "max_drift": worst_drift,
                    "max_ratio_op_over_coord": worst_ratio,
                    "drift_threshold": 0.25,
                    "ratio_threshold": 1.10,
                    "scales": scales_used,
                },
                interp
            )
    else:
        log_result("EXP_1C", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 2: CENTRIFUGE (Stress Test) -> VALIDATION / HYPOTHESIS
    # =========================================================================
    # Only if present (might be superseded by Exp 7)
    exp2 = data.get("experiment_2", {})
    exp2a = exp2.get("2A") if isinstance(exp2, dict) else None
    exp2b_rows = exp2.get("2B") if isinstance(exp2, dict) else None
    if isinstance(exp2a, list) and isinstance(exp2b_rows, list) and exp2a and exp2b_rows:
         # Simplified check
         max_rogue = max(pt["error"] for pt in exp2b_rows)
         max_clean = max(pt["error"] for pt in exp2a)
         amp = max_rogue / (max_clean if max_clean > 0 else 1)
         
         # Any amplification > 1% above baseline means the planted rogue
         # zero produces a detectable signal. Program 2 EXPLORATORY — does
         # not contribute theorem-directed evidence regardless of outcome.
         if amp > 1.01:
             status = "PASS"
             interp = (
                 f"Rogue zero signal detected: amplification ratio "
                 f"{amp:.4f}x above clean baseline."
             )
         else:
             status = "FAIL"
             interp = (
                 f"No significant signal amplification detected "
                 f"(ratio {amp:.4f}x, below 1% threshold)."
             )
         log_result(
             "EXP_2", "VALIDATION", status,
             {"amp": amp, "max_rogue": max_rogue, "max_clean": max_clean},
             interp,
         )
    else:
         log_result("EXP_2", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 2B: ROGUE ISOLATION -> VALIDATION
    # Pass Condition (MATH_README):
    #   Max Residual Deviation < 0.5 where Residual = Observed/Predicted
    # =========================================================================
    exp2b = data.get("experiment_2b", [])
    if isinstance(exp2b, list) and len(exp2b) > 0:
        residuals = []
        for row in exp2b:
            r = row.get("residual")
            if is_number(r):
                residuals.append(r)

        if not residuals:
            log_result(
                "EXP_2B",
                "VALIDATION",
                "INSUFFICIENT_DATA",
                {},
                "Residual series missing or non-numeric."
            )
        else:
            max_abs_dev = max(abs(r - 1.0) for r in residuals)
            if max_abs_dev < 0.5:
                status = "PASS"
                interp = "Observed residuals stay within theoretical tolerance; rogue isolation supported."
            else:
                status = "FAIL"
                interp = "Residual deviation exceeds tolerance; rogue isolation not supported at this fidelity."

            log_result(
                "EXP_2B",
                "VALIDATION",
                status,
                {
                    "max_abs_residual_dev": max_abs_dev,
                    "threshold": 0.5,
                    "count": len(residuals),
                },
                interp,
            )
    else:
        log_result("EXP_2B", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 3: FALSIFICATION (Beta=Pi) -> FALSIFICATION_CONTROL
    # =========================================================================
    exp3 = data.get("experiment_3", {})
    exp3_bad = exp3.get("3B") if isinstance(exp3, dict) else None
    exp3_true = exp3.get("TruePi") if isinstance(exp3, dict) else None
    if isinstance(exp3_bad, list) and isinstance(exp3_true, list) and exp3_bad and exp3_true:
        pi_err = max(abs(b["y"] - t["y"]) for b, t in zip(exp3_bad, exp3_true))
        # Ratio-based divergence test: compare counterfactual error to
        # baseline amplitude. Beta=pi should diverge dramatically.
        baseline_amplitude = max(
            (abs(t["y"]) for t in exp3_true), default=1.0
        )
        relative_divergence = pi_err / max(baseline_amplitude, 1e-15)

        if relative_divergence > 1.0:
            status = "PASS"
            interp = (
                f"Control armed: beta=pi reconstruction diverges from true "
                f"by {relative_divergence:.1f}x baseline amplitude "
                f"(pi_err={pi_err:.4g})."
            )
        else:
            status = "FAIL"
            interp = (
                f"Control NOT armed: beta=pi reconstruction only diverges "
                f"by {relative_divergence:.2f}x baseline amplitude — "
                f"expected dramatic divergence not detected."
            )
        log_result(
            "EXP_3", "FALSIFICATION_CONTROL", status,
            {
                "max_error": pi_err,
                "baseline_amplitude": baseline_amplitude,
                "relative_divergence": relative_divergence,
            },
            interp,
        )
    else:
        log_result("EXP_3", "FALSIFICATION_CONTROL", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 4: TRANSLATION VS DILATION -> HYPOTHESIS_TEST (Lattice stage)
    #
    # Decision rule, aligned with the Gauge -> Lattice -> Brittleness theory:
    #   - TRANSLATION wins with low delta_error -> PASS
    #     (consistent with Gauge: scaling is a trivial coord reparametrization,
    #      the expected outcome for this disambiguator)
    #   - DILATION wins with low delta_error -> NOTEWORTHY
    #     (candidate evidence that the scaling carries non-trivial operator
    #      content -- would support the Lattice claim; not a FAIL)
    #   - Either winner with high delta_error -> INSUFFICIENT_SEPARATION
    #     (the two models aren't resolvable at this fidelity)
    # delta_error threshold 0.05 is preserved from the prior rule.
    # =========================================================================
    exp4 = data.get("experiment_4", {})
    if exp4:
        if "1" in exp4:
            row = exp4["1"]
            winner = row["winner"]
            delta_err = row.get("delta_error")
            rmse_trans = row.get("rmse_trans")
            rmse_dil = row.get("rmse_dil")
            rmse_ratio = None
            if is_number(rmse_trans) and is_number(rmse_dil):
                rmse_ratio = rmse_dil / (rmse_trans + 1e-9)

            low_delta = is_number(delta_err) and delta_err < 0.05

            direction = None
            if not low_delta:
                status = "INSUFFICIENT_SEPARATION"
                interp = (
                    f"Cannot resolve Translation vs Dilation at current fidelity "
                    f"(delta_error={delta_err}). Re-run at higher precision or wider K."
                )
            elif winner == "TRANSLATION":
                status = "PASS"
                direction = "TRANSLATION"
                interp = (
                    "PATHFINDER verdict: TRANSLATION. Data supports Log-Translation "
                    "(coordinate reparametrization). Consistent with Gauge: no operator-"
                    "scaling signature detected."
                )
            elif winner == "DILATION":
                status = "NOTEWORTHY"
                direction = "DILATION"
                interp = (
                    "PATHFINDER verdict: DILATION. Data supports Log-Dilation (operator "
                    "scaling). Opens the Lattice-path investigation."
                )
            else:
                status = "INSUFFICIENT_DATA"
                interp = f"Unrecognized winner value: {winner!r}."

            log_result(
                "EXP_4", "HYPOTHESIS_TEST", status,
                {"winner": winner, "delta_err": delta_err, "ratio": rmse_ratio, "direction": direction},
                interp,
            )
        else:
            log_result("EXP_4", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
    else:
        log_result("EXP_4", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 5: ZERO CORRESPONDENCE -> HYPOTHESIS_TEST (PATHFINDER role)
    #
    # EXP_5 is a pathfinder: its job is to *answer* whether scaled zeros align
    # with existing zeros at lattice points, not to pass/fail the top-level
    # theory. Any decisive outcome (hit OR miss) is INFORMATIVE — it tells us
    # which path to pursue next. We preserve the median_z thresholds but label
    # outcomes with direction-flavored status strings so the mechanical status
    # doesn't visually contradict the theory_fit (INFORMATIVE).
    # =========================================================================
    exp5 = data.get("experiment_5", {})
    if exp5:
        # Check K=1
        if "1" in exp5:
            row = exp5["1"]
            if isinstance(row, dict) and row.get("error"):
                status = "INSUFFICIENT_DATA"
                interp = f"Cannot test correspondence: {row.get('error')}."
                log_result("EXP_5", "HYPOTHESIS_TEST", status, {"error": row.get("error")}, interp)
            elif not is_number(row.get("median_z")):
                status = "INSUFFICIENT_DATA"
                interp = "Median z-score missing or non-numeric."
                log_result("EXP_5", "HYPOTHESIS_TEST", status, {}, interp)
            else:
                median_z = row.get("median_z")

                if median_z < 0.1:
                    status = "PASS"
                    direction = "lattice-hit"
                    interp = (
                        "PATHFINDER verdict: lattice-hit. Scaled zeros map directly onto existing "
                        "zeros at this fidelity — consistent with the Lattice property."
                    )
                elif median_z < 0.25:
                    status = "NOTEWORTHY"
                    direction = "lattice-weak"
                    interp = (
                        "PATHFINDER verdict: weak alignment. Partial correspondence detected; "
                        "re-run at higher fidelity / larger N to disambiguate."
                    )
                else:
                    status = "NOTEWORTHY"
                    direction = "lattice-path-negative"
                    interp = (
                        "PATHFINDER verdict: lattice-path-negative. Scaled zeros do NOT align with "
                        "existing zeros at this fidelity — rules out the naive lattice path and "
                        "redirects toward the operator/coord-reparam investigation."
                    )

                log_result(
                    "EXP_5",
                    "HYPOTHESIS_TEST",
                    status,
                    {"median_z": median_z, "direction": direction},
                    interp,
                )
        else:
            log_result("EXP_5", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
    else:
        log_result("EXP_5", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 6: CRITICAL LINE DRIFT -> HYPOTHESIS_TEST
    # =========================================================================
    exp6 = data.get("experiment_6", {})
    if exp6:
        if "1" in exp6:
            row = exp6["1"]
            beta = row.get("beta_hat", 0.5)
            drift = abs(beta - 0.5)

            # Adaptive tolerance: prefer optimizer-reported uncertainty;
            # otherwise derive from the run's dps setting.
            beta_se = row.get("beta_se")
            beta_tol = row.get("beta_tolerance")
            if is_number(beta_se) and beta_se > 0:
                tolerance = 3.0 * beta_se
                tol_source = f"3*beta_se ({beta_se:.6g})"
            elif is_number(beta_tol) and beta_tol > 0:
                tolerance = beta_tol
                tol_source = f"beta_tolerance ({beta_tol:.6g})"
            else:
                # Precision-derived fallback: at 50 dps the optimizer
                # should converge to ~1e-10; at 35 dps ~1e-7.
                eff_dps = float(fidelity_dps) if is_number(fidelity_dps) else 50.0
                tolerance = max(10 ** (-min(eff_dps / 5.0, 10)), 1e-10)
                tol_source = f"dps-derived (dps={eff_dps})"

            if drift <= tolerance:
                status = "PASS"
                interp = (
                    f"beta_hat={beta:.6f} within tolerance of 0.5 "
                    f"(drift={drift:.2e}, tol={tolerance:.2e} via {tol_source})."
                )
            else:
                status = "FAIL"
                interp = (
                    f"beta_hat={beta:.6f} deviates from 0.5 beyond tolerance "
                    f"(drift={drift:.2e} > tol={tolerance:.2e} via {tol_source})."
                )

            log_result(
                "EXP_6", "HYPOTHESIS_TEST", status,
                {
                    "beta_hat": beta,
                    "drift": drift,
                    "tolerance": tolerance,
                    "tolerance_source": tol_source,
                },
                interp,
            )
        else:
            log_result("EXP_6", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
    else:
        log_result("EXP_6", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")
        
    # =========================================================================
    # EXP 7: CENTRIFUGE FIX -> VALIDATION
    # =========================================================================
    exp7 = data.get("experiment_7", {})
    if isinstance(exp7, dict) and "calibrated" in exp7 and exp7["calibrated"]:
        calib = exp7["calibrated"]
        # Check monotonicity: A(eps) should increase with eps
        amps = [c["max_amp"] for c in calib]
        amps = [a for a in amps if is_number(a)]
        if len(amps) < 2:
            log_result("EXP_7", "VALIDATION", "INSUFFICIENT_DATA", {"amps": amps}, "Not enough valid amplification points.")
            is_monotone = None
        else:
            is_monotone = all(x < y for x, y in zip(amps, amps[1:]))
        
        if is_monotone is not None:
            if is_monotone:
                status = "PASS"
                interp = "Sensitivity confirmed. Rogue signal amplifies monotonically with perturbation."
            else:
                status = "FAIL"
                interp = "Sensitivity test failed. Signal is not monotonic."
            
            log_result("EXP_7", "VALIDATION", status, {"monotone": is_monotone, "amps": amps}, interp)
    else:
        log_result("EXP_7", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 8: SCALED-ZETA ZERO EQUIVALENCE -> HYPOTHESIS_TEST
    # Adaptive Tolerance:
    #   tol_zero = max(5 * 10^(-declared_decimals), 1e-20)
    #   tol_residual = 10^(-min(30, dps/2))
    # Pass Condition:
    #   p99_abs_dev <= tol_zero AND p95_residual <= tol_residual
    # =========================================================================
    exp8 = data.get("experiment_8", {})
    exp8_status = "SKIP"
    if exp8 and exp8.get("per_k"):
        per_k = exp8.get("per_k", {})
        p99_vals = []
        p99_norm_vals = []
        p95_res_vals = []
        k_used = []

        for k, row in per_k.items():
            metrics = row.get("metrics", {}) if isinstance(row, dict) else {}
            p99 = metrics.get("p99_abs_dev")
            p95_res = metrics.get("p95_residual")
            if is_number(p99):
                p99_f = float(p99)
                p99_vals.append(p99_f)
                scale = row.get("scale") if isinstance(row, dict) else None
                scale_abs = abs(float(scale)) if is_number(scale) and float(scale) != 0.0 else 1.0
                p99_norm_vals.append(p99_f / scale_abs)
            if is_number(p95_res):
                p95_res_vals.append(float(p95_res))
            if is_number(p99) or is_number(p95_res):
                k_used.append(k)

        dps = data.get("meta", {}).get("dps", 50)
        dps = float(dps) if is_number(dps) else 50.0
        tol_residual_dps = 10 ** (-min(30, dps / 2.0))

        zinfo = data.get("meta", {}).get("zero_source_info", {})
        declared_decimals = zinfo.get("declared_decimals")
        tol_residual_source = None
        if is_number(declared_decimals):
            # Source quantization floor: avoid demanding residuals tighter than
            # the declared zero-source precision can support.
            tol_residual_source = 5 * (10 ** (-int(declared_decimals)))
            tol_zero = max(5 * (10 ** (-int(declared_decimals))), 1e-20)
        else:
            # Fallback when source precision metadata is missing.
            tol_zero = 1e-9
        tol_residual = max(
            tol_residual_dps,
            tol_residual_source if tol_residual_source is not None else 0.0,
        )

        if not p99_norm_vals or not p95_res_vals:
            exp8_status = "INSUFFICIENT_DATA"
            log_result(
                "EXP_8",
                "HYPOTHESIS_TEST",
                exp8_status,
                {
                    "tol_zero": tol_zero,
                    "tol_residual": tol_residual,
                    "tol_residual_dps": tol_residual_dps,
                    "tol_residual_source": tol_residual_source,
                    "k_values": k_used,
                },
                "Missing p99_abs_dev and/or p95_residual metrics."
            )
        else:
            worst_p99 = max(p99_vals)
            worst_p99_norm = max(p99_norm_vals)
            worst_p95_residual = max(p95_res_vals)
            if worst_p99_norm <= tol_zero and worst_p95_residual <= tol_residual:
                exp8_status = "PASS"
                interp = "Scaled-zeta zeros align with tau-scaled baseline zeros within adaptive tolerance."
            else:
                exp8_status = "FAIL"
                interp = "Scaled-zeta zeros deviate from tau-scaled baseline zeros beyond adaptive tolerance."

            log_result(
                "EXP_8",
                "HYPOTHESIS_TEST",
                exp8_status,
                {
                    "worst_p99_abs_dev": worst_p99,
                    "worst_p99_abs_dev_normalized": worst_p99_norm,
                    "worst_p95_residual": worst_p95_residual,
                    "tol_zero": tol_zero,
                    "tol_residual": tol_residual,
                    "tol_residual_dps": tol_residual_dps,
                    "tol_residual_source": tol_residual_source,
                    "k_values": k_used,
                },
                interp,
            )
    else:
        log_result("EXP_8", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 9: BOUNDED-VIEW DEMONSTRATION -> DEMONSTRATION
    # Not a witness for any obligation. Reports how many sampled zeros land
    # in the target window with their respective k_required.
    # =========================================================================
    exp9 = data.get("experiment_9", {})
    if isinstance(exp9, dict) and "samples" in exp9:
        samples = exp9.get("samples") or []
        in_window = exp9.get("in_window_count", 0)
        total = exp9.get("total_count", len(samples))
        window = exp9.get("target_window", {})
        if total > 0 and in_window == total:
            status = "PASS"
            interp = (
                f"All {total} sampled zeros admit an integer k that brings the "
                f"image into [{window.get('lo')}, {window.get('hi')}]. The "
                "bounded-view corollary's mechanics are demonstrable for the "
                "tested heights IF transport holds."
            )
        elif total > 0:
            status = "NOTEWORTHY"
            interp = (
                f"{in_window}/{total} sampled zeros land in the bounded window "
                "with their k_required. Widen the window or pick a different "
                "sample set."
            )
        else:
            status = "INSUFFICIENT_DATA"
            interp = "EXP_9 produced no samples."
        log_result(
            "EXP_9",
            "DEMONSTRATION",
            status,
            {
                "in_window_count": in_window,
                "total_count": total,
                "window_lo": window.get("lo"),
                "window_hi": window.get("hi"),
                "k_required_per_sample": [s.get("k_required") for s in samples],
            },
            interp,
        )
    else:
        log_result("EXP_9", "DEMONSTRATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 10: ZETA GAUGE TRANSPORT RESIDUAL -> EXPLORATORY (Level-4 witness)
    # Operates directly on zeta(s), not on pi_N. Quantifies how far zeta is
    # from being multiplicatively gauge-invariant on the declared t-window.
    # Outcome is INFORMATIONAL by classification (function = EXPLORATORY +
    # Plan C eligibility filter); cannot vote in stage_verdicts.
    # =========================================================================
    exp10 = data.get("experiment_10", {})
    if isinstance(exp10, dict) and "bases" in exp10:
        bases_data = exp10.get("bases", {})
        summary_data = exp10.get("summary", {})
        config = exp10.get("config", {})
        if bases_data:
            tau_max_k1 = summary_data.get("tau_max_k1")
            baseline_max_k1 = summary_data.get("sanity_baseline_max_k1")
            ratio = summary_data.get("sanity_baseline_ratio")
            best = summary_data.get("best_base_per_k", {})
            interp_parts = [
                f"Sampled {config.get('M', '?')} t-points across "
                f"{len(bases_data)} bases x {len(config.get('k_values', []))} k-values."
            ]
            if tau_max_k1 is not None:
                interp_parts.append(
                    f"max|residual| at tau, k=1: {tau_max_k1:.4e}; "
                    f"baseline (c=1.0001): {baseline_max_k1:.4e}; "
                    f"ratio: {ratio:.2e}."
                )
            if best:
                interp_parts.append(f"best base per k: {best}.")
            interp_parts.append(
                "INFORMATIONAL: zeta is not multiplicatively gauge-invariant in "
                "general; this run quantifies the deviation, not a proof of any kind."
            )
            status = "PASS"  # always PASS for EXPLORATORY artifacts that produced data
            interp = " ".join(interp_parts)
            log_result(
                "EXP_10",
                "VALIDATION",  # type_str (legacy); FUNCTION_MAP=EXPLORATORY is canonical
                status,
                {
                    "max_residual_per_base": summary_data.get("max_residual_per_base", {}),
                    "best_base_per_k": best,
                    "tau_max_k1": tau_max_k1,
                    "sanity_baseline_max_k1": baseline_max_k1,
                    "sanity_baseline_ratio": ratio,
                    "bases": list(bases_data.keys()),
                    "k_values": config.get("k_values", []),
                    "M": config.get("M"),
                    "T0": config.get("T0"),
                    "L": config.get("L"),
                },
                interp,
            )
        else:
            log_result("EXP_10", "VALIDATION", "INSUFFICIENT_DATA", {}, "EXP_10 produced no per-base residuals.")
    else:
        log_result("EXP_10", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # ZERO PATH DECISION (based on EXP_8)
    # =========================================================================
    exp8_summary = summary["experiments"].get("EXP_8", {})
    exp8_status = exp8_summary.get("status", "SKIP")
    if exp8_status == "PASS":
        zero_path_decision = "SCALE_AD_HOC"
        zero_path_reason = "EXP_8 passed adaptive tolerance checks."
    elif exp8_status == "FAIL":
        zero_path_decision = "COMPUTE_PER_K"
        zero_path_reason = "EXP_8 failed adaptive tolerance checks."
    else:
        zero_path_decision = "UNDECIDED"
        zero_path_reason = f"EXP_8 status is {exp8_status}."
    summary["zero_path_decision"] = zero_path_decision
    summary["zero_path_reason"] = zero_path_reason

    # =========================================================================
    # DEPRECATED STAGE ROLLUP (PROOF_PROGRAM_SPEC.md §6)
    # Stage-level *theory* rollups are forbidden under the new ontology: the
    # stage axis is a noncanonical grouping only. This block is retained as a
    # backward-compat shim so the existing StageBanner keeps rendering through
    # one release; Sprint 2b replaces the consuming component with
    # `ProofProgramMap` driven by `summary.proof_program` and
    # `summary.implementation_health` (emitted further down).
    #
    # Historical precedence rules (kept verbatim for the shim):
    #   REFUTES / CONTROL_BROKEN in any member    -> stage REFUTES
    #   all members INCONCLUSIVE                  -> stage INCONCLUSIVE
    #   only INFORMATIVE (no SUPPORTS, no FAILS)  -> stage PARTIAL
    #   INFORMATIVE + SUPPORTS, no REFUTES        -> stage CANDIDATE
    #   any CANDIDATE, rest SUPPORTS/INCONCLUSIVE -> stage CANDIDATE
    #   all SUPPORTS (ignoring INCONCLUSIVE)      -> stage SUPPORTS
    #   otherwise                                  -> stage PARTIAL
    # =========================================================================
    # Per PROOF_PROGRAM_SPEC.md Decision Log #2, Contradiction Track results
    # MUST NOT contribute to the theorem-candidate verdict. The "brittleness"
    # stage contains only Program 2 experiments (EXP_2 / EXP_2B / EXP_7); previously
    # its REFUTES status leaked into `overall`. We now (a) skip stages whose
    # entire membership is Program 2 in stage_verdicts and (b) emit those
    # experiments under summary["program_2_summary"] for informational display.
    program_2_summary = {}
    stage_verdicts = {}
    for stage_name in ("gauge", "lattice", "brittleness", "control"):
        members = [
            (exp_id, summary["experiments"][exp_id])
            for exp_id in summary["experiments"]
            if STAGE_MAP.get(exp_id) == stage_name
        ]
        if not members:
            stage_verdicts[stage_name] = {
                "status": "INCONCLUSIVE",
                "reason": "no experiments mapped to stage",
                "members": [],
                "member_fits": {},
                "role_breakdown": {},
            }
            continue

        program_breakdown = {}
        for mid, _ in members:
            p = PROGRAM_MAP.get(mid, "PROGRAM_1")
            program_breakdown[p] = program_breakdown.get(p, 0) + 1

        # If every member is PROGRAM_2, the stage cannot contribute to the
        # theorem verdict. Move it out of stage_verdicts entirely.
        if program_breakdown.get("PROGRAM_2", 0) == len(members) and len(members) > 0:
            program_2_summary[stage_name] = {
                "members": [mid for mid, _ in members],
                "outcomes": {
                    mid: entry.get("outcome", "INCONCLUSIVE") for mid, entry in members
                },
                "note": (
                    "Contradiction Track experiments are excluded from theorem verdict "
                    "until rogue detectability, no-hiding under compression, and "
                    "contradiction closure are formalized. Outcomes shown for "
                    "informational use only."
                ),
            }
            continue

        # Function-axis eligibility filter (PROOF_PROGRAM_SPEC.md §6 / Decision
        # Log #2 generalized): RESEARCH_NOTE / DEMONSTRATION / EXPLORATORY /
        # VISUALIZATION experiments self-declare not-a-witness and must not vote
        # in the theorem-level rollup. Their `theory_fit` (a legacy shim value)
        # can still register as REFUTES on a FAIL status, which would otherwise
        # leak engineering / informational outcomes into the theorem verdict.
        # Mirrors the PROGRAM_2 escape above, applied along the function axis.
        INELIGIBLE_FUNCTIONS = {
            "RESEARCH_NOTE",
            "DEMONSTRATION",
            "EXPLORATORY",
            "VISUALIZATION",
        }
        voting_members = [
            (mid, entry) for mid, entry in members
            if entry.get("function") not in INELIGIBLE_FUNCTIONS
        ]
        excluded_from_verdict = [
            mid for mid, entry in members
            if entry.get("function") in INELIGIBLE_FUNCTIONS
        ]

        # Reporting fits include all members so the UI can show what they
        # returned, but verdict computation uses voting_members only.
        fits_all = [(mid, entry.get("theory_fit", "INCONCLUSIVE")) for mid, entry in members]
        member_ids = [mid for mid, _ in fits_all]
        member_fits = {mid: fit for mid, fit in fits_all}

        fits = [(mid, entry.get("theory_fit", "INCONCLUSIVE")) for mid, entry in voting_members]
        voting_member_fits = {mid: fit for mid, fit in fits}

        role_breakdown = {}
        for mid, entry in members:
            r = entry.get("role", "UNKNOWN")
            role_breakdown[r] = role_breakdown.get(r, 0) + 1

        refuting = [mid for mid, fit in fits if fit in ("REFUTES", "CONTROL_BROKEN")]
        supporting = [mid for mid, fit in fits if fit == "SUPPORTS"]
        candidate = [mid for mid, fit in fits if fit == "CANDIDATE"]
        informative = [mid for mid, fit in fits if fit == "INFORMATIVE"]
        decisive = [mid for mid, fit in fits if fit != "INCONCLUSIVE"]

        if not voting_members:
            verdict = "INCONCLUSIVE"
            reason = (
                f"all members non-voting by function-axis policy "
                f"(excluded: {excluded_from_verdict})"
            )
        elif refuting:
            verdict = "REFUTES"
            reason = f"theory-refuting outcomes in: {refuting}"
        elif not decisive:
            verdict = "INCONCLUSIVE"
            reason = "no experiments in this stage produced decisive data"
        elif informative and not supporting and not candidate:
            verdict = "PARTIAL"
            reason = (
                f"pathfinders answered ({informative}) but no enabler has confirmed the "
                f"chain at this stage yet"
            )
        elif informative and (supporting or candidate):
            verdict = "CANDIDATE"
            reason = (
                f"pathfinders informed direction ({informative}) + confirming evidence "
                f"(supports: {supporting}, candidates: {candidate})"
            )
        elif candidate and not refuting:
            verdict = "CANDIDATE"
            reason = f"supporting + candidate evidence (candidate: {candidate})"
        elif supporting and not candidate and not refuting:
            verdict = "SUPPORTS"
            reason = f"all decisive experiments support the theory ({len(supporting)}/{len(members)})"
        else:
            verdict = "PARTIAL"
            reason = f"mixed theory_fit: {sorted(set(fit for _, fit in fits))}"

        stage_verdicts[stage_name] = {
            "status": verdict,
            "reason": reason,
            "members": member_ids,
            "member_fits": member_fits,
            "voting_member_fits": voting_member_fits,
            "excluded_from_verdict": excluded_from_verdict,
            "role_breakdown": role_breakdown,
        }

    summary["stage_verdicts"] = stage_verdicts
    summary["program_2_summary"] = program_2_summary

    # =========================================================================
    # IMPLEMENTATION-HEALTH ROLLUP (non-theoretic; PROOF_PROGRAM_SPEC.md §6)
    # Replaces the theorem-level semantics of stage_verdicts. Answers "is the
    # engine healthy in this grouping?" — not "does the theory hold?". `stage`
    # itself remains a legitimate grouping axis (spec Decision Log #5).
    # =========================================================================
    implementation_health = {}
    for stage_name in ("gauge", "lattice", "brittleness", "control", "demonstration"):
        members = [
            (exp_id, summary["experiments"][exp_id])
            for exp_id in summary["experiments"]
            if STAGE_MAP.get(exp_id) == stage_name
        ]
        if not members:
            implementation_health[stage_name] = {
                "status": "NO_MEMBERS",
                "members": [],
                "reason": "no experiments mapped to stage",
            }
            continue
        outcomes = [entry.get("outcome", "INCONCLUSIVE") for _, entry in members]
        broken = [
            exp_id for exp_id, entry in members
            if entry.get("outcome") == "IMPLEMENTATION_BROKEN"
        ]
        healthy_outcomes = {
            "IMPLEMENTATION_OK", "CONSISTENT", "DIRECTIONAL", "INFORMATIONAL", "INCONCLUSIVE"
        }
        if broken:
            health_status = "IMPLEMENTATION_BROKEN"
            reason = f"broken: {broken}"
        elif all(o in healthy_outcomes for o in outcomes):
            health_status = "IMPLEMENTATION_OK"
            reason = f"all {len(members)} members healthy or inconclusive"
        else:
            health_status = "MIXED"
            reason = f"mixed outcomes: {sorted(set(outcomes))}"
        implementation_health[stage_name] = {
            "status": health_status,
            "members": [mid for mid, _ in members],
            "reason": reason,
        }
    summary["implementation_health"] = implementation_health

    # =========================================================================
    # PROOF PROGRAM (canonical; PROOF_PROGRAM_SPEC.md §6)
    # Theorem candidate + obligations (with filled-in witness lists) + open
    # gaps. This is the surface Sprint 2b's ProofProgramMap consumes.
    # =========================================================================
    summary["proof_program"] = _build_proof_program(
        summary["experiments"], fidelity_tier
    )

    # =========================================================================
    # PROOF ASSEMBLY (claim-down; proof_kernel/scoped_failure.py)
    # Evaluates each necessary condition against available evidence.
    # Only NC4 (predicate transport) can kill the theory.
    # =========================================================================
    _certificate = load_certificate()
    summary["proof_assembly"] = build_proof_assembly(
        summary["experiments"], fidelity_tier, _certificate
    )

    # Single source of truth for the role/function/stage/obligation map. UI
    # should read from data.meta.experiment_classification instead of
    # duplicating ROLE_MAP. (Sprint 2c wires the sidebar to this.)
    data.setdefault("meta", {})["experiment_classification"] = (
        _build_experiment_classification()
    )

    # Finalize — `overall` is now derived from implementation_health, not
    # from theory_fit votes. PROOF_PROGRAM_SPEC.md Decision Log #6 forbids
    # a project-wide theory PASS/FAIL; this field is retained for one
    # release so the current StageBanner keeps rendering, but its semantics
    # are now "engine healthy?" not "theorem proved?"
    any_broken = any(
        details.get("status") == "IMPLEMENTATION_BROKEN"
        for details in implementation_health.values()
        if isinstance(details, dict)
    )
    summary["overall"] = "FAIL" if any_broken else "PASS"
    summary["overall_semantics"] = "implementation_health"
    data["summary"] = summary

    # =========================================================================
    # TOP-LEVEL MIRROR (DEPRECATED — read summary.* in new code).
    # Older readers (early UI scaffolding, MCP bridge) consult these top-level
    # fields. load_or_init_results() seeds them with NO_CURRENT_RUN/SKIP/{}
    # placeholders; nothing in run_verification was overwriting them, so the
    # disk file ended up self-inconsistent (top-level claimed no run while
    # summary.* held a graded result). Mirror summary back to the shadow so
    # both views agree. Canonical source of truth is summary.* — these are
    # mirror-only and will be removed in a future release.
    # =========================================================================
    data["engine_status"] = "OK" if summary.get("overall") in ("PASS", "FAIL") else "NO_CURRENT_RUN"
    data["overall"] = summary["overall"]
    data["stage_verdicts"] = {
        s: v.get("status", "INCONCLUSIVE") for s, v in stage_verdicts.items()
    }
    data["fidelity_tier"] = summary.get("fidelity_tier")

    # =========================================================================
    # REGRESSION LOG: append one line per verifier run to verdict_history.jsonl.
    # Canonical history axes are obligation_statuses + implementation_health.
    # Legacy stage_verdicts remains in the record for one-release compatibility.
    # =========================================================================
    try:
        prev_line = None
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        prev_line = line
        prev_record = json.loads(prev_line) if prev_line else None

        obligation_statuses = {
            obl["id"]: obl.get("status", "CONJECTURAL")
            for obl in summary.get("proof_program", {}).get("obligations", [])
            if isinstance(obl, dict) and isinstance(obl.get("id"), str)
        }
        implementation_health_statuses = {
            stage_name: details.get("status", "NO_MEMBERS")
            for stage_name, details in summary.get("implementation_health", {}).items()
            if isinstance(details, dict)
        }

        record = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "schema_version": EXPECTED_SCHEMA_VERSION,
            "fidelity_tier": fidelity_tier,
            "overall": summary["overall"],
            "obligation_statuses": obligation_statuses,
            "implementation_health_statuses": implementation_health_statuses,
            "stage_verdicts": {
                s: v["status"] for s, v in stage_verdicts.items()
            },
            "code_fingerprint": data.get("meta", {}).get("code_fingerprint", {}),
            "zero_source_info": data.get("meta", {}).get("zero_source_info", {}),
        }

        def _collect_flips(curr_map, prev_map):
            flips = []
            for key, curr_status in curr_map.items():
                prev_status = prev_map.get(key)
                if prev_status is not None and prev_status != curr_status:
                    flips.append((key, prev_status, curr_status))
            return flips

        if prev_record is not None:
            flipped_obligations = _collect_flips(
                record["obligation_statuses"],
                prev_record.get("obligation_statuses", {}),
            )
            flipped_health = _collect_flips(
                record["implementation_health_statuses"],
                prev_record.get("implementation_health_statuses", {}),
            )
            if flipped_obligations or flipped_health:
                print("\n" + "!" * 75)
                print(" [REGRESSION] Canonical history FLIP(S) detected vs prior run:")
                for obl_id, prev_status, curr_status in flipped_obligations:
                    print(f"   - obligation {obl_id}: {prev_status} -> {curr_status}")
                for stage_name, prev_status, curr_status in flipped_health:
                    print(
                        f"   - implementation_health[{stage_name}]: "
                        f"{prev_status} -> {curr_status}"
                    )
                print("!" * 75)

        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        with open(HISTORY_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as exc:
        print(f" [WARN] Could not append to verdict history log: {exc}")

    report_progress(message="Verifier complete", status=summary.get("overall"))
    emit_run_event(
        emit_run_events,
        kind="PHASE",
        phase="VERIFY",
        state="done",
        message="Verifier complete",
        completed_units=progress_total,
        total_units=progress_total,
        percent=95,
        payload={"phase_duration_seconds": time.time() - verify_started},
    )

    return data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Riemann verifier")
    parser.add_argument(
        "--emit-run-events",
        action="store_true",
        help="Emit structured run events for orchestration/status pipelines",
    )
    cli_args = parser.parse_args()

    # Standalone run
    d = run_verification(emit_run_events=cli_args.emit_run_events)
    if d:
        atomic_json_dump(OUTPUT_FILE, d)
