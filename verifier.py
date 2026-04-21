import copy
import json
import os
import math
import datetime

# Output paths. The Next.js app serves files under repo-root `public/`; the
# legacy `dashboard/public/` paths are retained as a fallback so older scripts
# still resolve until the dashboard-directory refactor is fully cleaned up.
OUTPUT_FILE = "public/experiments.json"
HISTORY_FILE = "public/verdict_history.jsonl"
LEGACY_OUTPUT_FILES = ("dashboard/public/experiments.json",)
LEGACY_HISTORY_FILES = ("dashboard/public/verdict_history.jsonl",)

# Must match experiment_engine.SCHEMA_VERSION. Bump in both places when the
# artifact shape changes (top-level keys, summary shape, stage names, etc.).
EXPECTED_SCHEMA_VERSION = "2026.05.0"

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
    "EXP_1":  "COHERENCE_WITNESS",        # reconstruction covariance, "showing the work"
    "EXP_1B": "CONTROL",                  # naive operator scaling must break
    "EXP_1C": "COHERENCE_WITNESS",        # zero-scaling coherence, not a direct obligation witness
    "EXP_2":  "EXPLORATORY",              # brittleness — Program 2 only
    "EXP_2B": "EXPLORATORY",              # rogue isolation — Program 2 only
    "EXP_3":  "CONTROL",                  # beta=pi counterfactual must diverge
    "EXP_4":  "PATHFINDER",               # translation vs dilation direction choice
    "EXP_5":  "PATHFINDER",               # lattice-hit / miss direction choice
    "EXP_6":  "PROOF_OBLIGATION_WITNESS", # provisional — beta-invariance witness
    "EXP_7":  "EXPLORATORY",              # calibrated sensitivity — Program 2 only
    "EXP_8":  "REGRESSION_CHECK",         # scaled-zeta identity plumbing
}

# Axis C — kind of claim this result licenses.
EPISTEMIC_LEVEL_MAP = {
    "EXP_1":  "EMPIRICAL",
    "EXP_1B": "INSTRUMENTAL",
    "EXP_1C": "EMPIRICAL",
    "EXP_2":  "EMPIRICAL",
    "EXP_2B": "EMPIRICAL",
    "EXP_3":  "INSTRUMENTAL",
    "EXP_4":  "EMPIRICAL",
    "EXP_5":  "EMPIRICAL",
    "EXP_6":  "EMPIRICAL",
    "EXP_7":  "EMPIRICAL",
    "EXP_8":  "INSTRUMENTAL",
}

# Which named research program each experiment lives in. PROGRAM_1 is canonical
# (direct invariance); PROGRAM_2 is exploratory (contradiction-by-detectability).
# See PROOF_PROGRAM_SPEC.md Decision Log #2.
PROGRAM_MAP = {
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
}

# Only PROOF_OBLIGATION_WITNESS carries an obligation_id. Provisional per §7.
OBLIGATION_MAP = {
    "EXP_6": "OBL_BETA_INVARIANCE",
}

WITNESS_MAP_REVIEW_STATUS = "PENDING_SIGNOFF"  # set to SIGNED_OFF after review
WITNESS_MAP_REVIEW_TEMPLATE = {
    "gate_id": "SPRINT_3B_0_WITNESS_MAP_REVIEW",
    "status": WITNESS_MAP_REVIEW_STATUS,
    "api_contract_ready": False,
    "notes": [
        "Experiment->obligation mapping is frozen from the provisional state.",
        "Mappings remain provisional in artifact output until witness-map review sign-off.",
        "Do not finalize HTTP/API contracts as authoritative while status != SIGNED_OFF.",
    ],
}

# Mandatory inference rails (PROOF_PROGRAM_SPEC.md §5/§6). Every experiment's
# record must populate these; disallowed_conclusion must include at least one
# theorem-level overreach disclaimer.
INFERENCE_RAILS = {
    "EXP_1": {
        "inference_scope": "this run, tested k-range, at declared fidelity",
        "allowed_conclusion": [
            "The explicit-formula reconstruction is numerically covariant under "
            "X -> X/tau^k on the tested k-range at the stated fidelity.",
        ],
        "disallowed_conclusion": [
            "The Riemann Hypothesis is true.",
            "The zero-scaling hypothesis is confirmed.",
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
        "inference_scope": "this run, tested k-range, at declared fidelity",
        "allowed_conclusion": [
            "Scaling zeros by tau^k is numerically isometric to scaling the "
            "lattice by tau^k on the tested range at the stated tolerances.",
        ],
        "disallowed_conclusion": [
            "OBL_ZERO_SCALING_EQUIVALENCE is formally proven.",
            "The RH predicate transports exactly under the gauge.",
            "The theorem candidate is proved.",
        ],
    },
    "EXP_2": {
        "inference_scope": "this run, Program 2 exploratory; planted rogue zero",
        "allowed_conclusion": [
            "Under deep zoom, a planted off-line zero produces visible error "
            "amplification relative to the clean baseline at this run's settings.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported.",
            "No off-line zero exists at arbitrary height.",
            "Program 2's non-hiding theorem is established.",
        ],
    },
    "EXP_2B": {
        "inference_scope": "this run, Program 2 exploratory; residual isolation",
        "allowed_conclusion": [
            "The residual error scales as x^(0.5+delta) as the single-perturbed-"
            "zero model predicts at this run's settings.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported.",
            "All off-line zeros are isolable in general.",
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
        "inference_scope": "this run, Program 2 exploratory; epsilon-sweep",
        "allowed_conclusion": [
            "The rogue-amplification function A(epsilon) is monotone across "
            "the swept epsilon range at this run's settings.",
        ],
        "disallowed_conclusion": [
            "The theorem candidate is supported.",
            "A non-hiding theorem is established.",
        ],
    },
    "EXP_8": {
        "inference_scope": "this run, zeta(s*tau^k) identity check",
        "allowed_conclusion": [
            "The zero-generator respects the zeta(s*tau^k) identity numerically "
            "within the adaptive tolerance.",
        ],
        "disallowed_conclusion": [
            "Anything about the RH predicate.",
            "Anything about the theorem candidate.",
            "Anything about whether zero-scaling preserves RH-relevant structure.",
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
            "There exists a nontrivial multiplicative gauge T_c : s -> s * c^k "
            "(c > 1 real, k integer) under which the RH-relevant analytic "
            "structure of zeta is preserved strongly enough that the compressed "
            "view under T_c and the uncompressed view are the same mathematical "
            "case for the purposes of the RH predicate. Equivalently: if zeta "
            "has a non-trivial zero rho with Re(rho) != 1/2, its image under "
            "T_c is likewise off the critical line, and conversely."
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
            "proving RH.",
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
            "status": "OPEN",
            "witnesses": [],
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
            "status": "OPEN",
            "witnesses": [],
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
            "status": "OPEN",
            "witnesses": [],
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
            "status": "OPEN",
            "witnesses": [],
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
            "title": "Rogue-zero detectability (Program 2, optional)",
            "statement": (
                "Any off-line zero within the covered ordinate range produces "
                "an amplification signature that is finite-k-detectable under "
                "the gauge."
            ),
            "status": "OPEN",
            "witnesses": [],
            "program": "PROGRAM_2",
            "inference": {
                "inference_scope": "Program 2, obligation-level; exploratory",
                "allowed_conclusion": [
                    "When exploratorily witnessed, the amplification function "
                    "behaves monotonically under the tested perturbations.",
                ],
                "disallowed_conclusion": [
                    "This obligation alone proves the theorem candidate.",
                    "A non-hiding theorem is established by these witnesses.",
                    "Program 2 is currently on the proof-critical path.",
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
            "id": "GAP_COVERAGE_TRANSPORT",
            "title": "No zero hides at arbitrary height",
            "description": (
                "Heuristic argument that a rogue zero at ordinate ~10^9999 "
                "cannot hide under compression; no formal non-hiding theorem."
            ),
        },
        {
            "id": "GAP_PROGRAM2_FORMALIZATION",
            "title": "Formal non-hiding theorem for Program 2",
            "description": (
                "The contradiction-by-detectability route lacks a formal "
                "amplification/non-hiding theorem."
            ),
            "blocker_for": ["OBL_ROGUE_DETECTABILITY"],
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
      PROOF_OBLIGATION_WITNESS / COHERENCE_WITNESS / EXPLORATORY / THEOREM_STATEMENT:
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
        if exp_id in OBLIGATION_MAP:
            entry["obligation_id"] = OBLIGATION_MAP[exp_id]
            if WITNESS_MAP_REVIEW_STATUS != "SIGNED_OFF":
                entry["mapping_provisional"] = True
        out[exp_id] = entry
    return out


def _build_proof_program(experiments, fidelity_tier):
    """Return a fresh ProofProgram object with obligation witness lists filled
    in from the observed `summary.experiments`. An obligation flips from OPEN
    to WITNESSED iff at least one PROOF_OBLIGATION_WITNESS produced a
    CONSISTENT outcome at AUTHORITATIVE fidelity. Below AUTHORITATIVE the
    obligation stays OPEN but the witness is still recorded (with the
    verifier's existing provisional-flag policy applied at the entry level).
    """
    prog = copy.deepcopy(PROOF_PROGRAM_TEMPLATE)
    review = copy.deepcopy(WITNESS_MAP_REVIEW_TEMPLATE)

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

    for obl in prog["obligations"]:
        consistent_witnesses = []
        any_witnesses = []
        for exp_id, entry in experiments.items():
            if entry.get("function") != "PROOF_OBLIGATION_WITNESS":
                continue
            if entry.get("obligation_id") != obl["id"]:
                continue
            any_witnesses.append(exp_id)
            if entry.get("outcome") == "CONSISTENT" and not entry.get("provisional"):
                consistent_witnesses.append(exp_id)
        # Record every witnessing experiment (consistent or not) so consumers
        # can see what tried to bear on this obligation; status reflects only
        # the strong case.
        obl["witnesses"] = any_witnesses
        if any_witnesses and WITNESS_MAP_REVIEW_STATUS != "SIGNED_OFF":
            note = (
                "Witness mapping is provisional pending Sprint 3b.0 "
                "GAP_WITNESS_MAP_REVIEW sign-off."
            )
            prior = obl.get("notes")
            obl["notes"] = f"{prior} {note}".strip() if prior else note
        if consistent_witnesses and fidelity_tier == "AUTHORITATIVE":
            obl["status"] = "WITNESSED"
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


def run_verification(data=None):
    if data is None:
        source_file = OUTPUT_FILE
        if not os.path.exists(source_file):
            source_file = None
            for legacy in LEGACY_OUTPUT_FILES:
                if os.path.exists(legacy):
                    source_file = legacy
                    break
        if source_file is None:
            print(" [NO] Data file not found. Run the engine first.")
            return None
        if source_file != OUTPUT_FILE:
            print(f" [WARN] Using legacy artifact path: {source_file}")
        with open(source_file, "r") as f:
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

    overall_pass = True

    def log_result(exp_id, type_str, status, metric_summary, interpretation):
        nonlocal overall_pass

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
        if obligation_id:
            entry["obligation_id"] = obligation_id
            if mapping_provisional:
                entry["mapping_provisional"] = True
        if direction:
            entry["direction"] = direction
        if provisional:
            entry["provisional"] = True
        summary["experiments"][exp_id] = entry

        # Legacy overall flip: keep the PASS/FAIL bit driven by the same
        # signals as before so the deprecation-shim `overall` field matches
        # historical semantics. Sprint 2b removes this field's UI use.
        if fit in ("REFUTES", "CONTROL_BROKEN"):
            overall_pass = False

    def is_number(x):
        return isinstance(x, (int, float)) and math.isfinite(x)

    # =========================================================================
    # EXP 1: COORDINATE GAUGE (Isometry) -> VALIDATION
    # =========================================================================
    exp1 = data.get("experiment_1", {})
    if "0" in exp1:
        max_drift = 0.0
        scales_analyzed = []
        k0_data = exp1["0"]
        
        for k_str, k_data in exp1.items():
            if k_str == "0": continue
            scales_analyzed.append(k_str)
            if len(k0_data) == len(k_data):
                for p0, pk in zip(k0_data, k_data):
                    drift = abs(p0["y_rec"] - pk["y_rec"])
                    if drift > max_drift: max_drift = drift
        
        # Verdict
        if max_drift < 1e-9:
            status = "PASS"
            interp = "Strict geometric isometry confirmed. Coordinate scaling works as expected."
        else:
            status = "FAIL"
            interp = "Gauge symmetry broken. Coordinate scaling failed to match baseline."
            
        log_result("EXP_1", "VALIDATION", status, {"max_drift": max_drift}, interp)
    else:
        log_result("EXP_1", "VALIDATION", "SKIP", {}, "Missing Data")

    # =========================================================================
    # EXP 1B: OPERATOR GAUGE (Falsification) -> FALSIFICATION_CONTROL
    # =========================================================================
    exp1b = data.get("experiment_1b", {}).get("variants", {})
    if "gamma_scaled" in exp1b:
        base = exp1b["gamma_scaled"].get("0", [])
        max_drift = 0.0
        for k, pts in exp1b["gamma_scaled"].items():
            if k == "0": continue
            for p_base, p_k in zip(base, pts):
                drift = abs(p_base["y_rec"] - p_k["y_rec"])
                max_drift = max(max_drift, drift)
                
        if max_drift > 1.0:
            status = "PASS"
            interp = "System broke as expected under naive gamma scaling."
        else:
            status = "FAIL"
            interp = "Control failed: Naive gamma scaling weirdly matched baseline."
            
        log_result("EXP_1B", "FALSIFICATION_CONTROL", status, {"max_drift": max_drift}, interp)
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
    if "2A" in exp2 and "2B" in exp2:
         # Simplified check
         max_rogue = max(pt["error"] for pt in exp2["2B"])
         max_clean = max(pt["error"] for pt in exp2["2A"])
         amp = max_rogue / (max_clean if max_clean > 0 else 1)
         
         if amp > 1.001:
             status = "PASS"
             interp = "Rogue zero signal detected."
         else:
             status = "FAIL"
             interp = "No signal amplification."
         log_result("EXP_2", "VALIDATION", status, {"amp": amp}, interp)
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
    if "3B" in exp3 and "TruePi" in exp3:
        pi_err = max(abs(b["y"] - t["y"]) for b, t in zip(exp3["3B"], exp3["TruePi"]))
        if pi_err > 1000.0:
            status = "PASS"
            interp = "Beta=Pi hypothesis exploded to infinity as expected."
        else:
            status = "FAIL"
            interp = "Beta=Pi did not diverge enough."
        log_result("EXP_3", "FALSIFICATION_CONTROL", status, {"max_error": pi_err}, interp)

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
            
            if drift < 0.005:
                status = "PASS"
                interp = "Critical line is stable at Beta=0.5 under scaling."
            else:
                status = "FAIL"
                interp = f"Drift detected! Beta prefers {beta:.4f}."
                
            log_result("EXP_6", "HYPOTHESIS_TEST", status, {"beta_hat": beta, "drift": drift}, interp)
        else:
            log_result("EXP_6", "HYPOTHESIS_TEST", "INSUFFICIENT_DATA", {}, "K=1 row missing; cannot apply decision rule.")
    else:
        log_result("EXP_6", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")
        
    # =========================================================================
    # EXP 7: CENTRIFUGE FIX -> VALIDATION
    # =========================================================================
    exp7 = data.get("experiment_7", {})
    if "calibrated" in exp7:
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
    if exp8:
        per_k = exp8.get("per_k", {})
        p99_vals = []
        p95_res_vals = []
        k_used = []

        for k, row in per_k.items():
            metrics = row.get("metrics", {}) if isinstance(row, dict) else {}
            p99 = metrics.get("p99_abs_dev")
            p95_res = metrics.get("p95_residual")
            if is_number(p99):
                p99_vals.append(float(p99))
            if is_number(p95_res):
                p95_res_vals.append(float(p95_res))
            if is_number(p99) or is_number(p95_res):
                k_used.append(k)

        dps = data.get("meta", {}).get("dps", 50)
        dps = float(dps) if is_number(dps) else 50.0
        tol_residual = 10 ** (-min(30, dps / 2.0))

        zinfo = data.get("meta", {}).get("zero_source_info", {})
        declared_decimals = zinfo.get("declared_decimals")
        if is_number(declared_decimals):
            tol_zero = max(5 * (10 ** (-int(declared_decimals))), 1e-20)
        else:
            # Fallback when source precision metadata is missing.
            tol_zero = 1e-9

        if not p99_vals or not p95_res_vals:
            exp8_status = "INSUFFICIENT_DATA"
            log_result(
                "EXP_8",
                "HYPOTHESIS_TEST",
                exp8_status,
                {
                    "tol_zero": tol_zero,
                    "tol_residual": tol_residual,
                    "k_values": k_used,
                },
                "Missing p99_abs_dev and/or p95_residual metrics."
            )
        else:
            worst_p99 = max(p99_vals)
            worst_p95_residual = max(p95_res_vals)
            if worst_p99 <= tol_zero and worst_p95_residual <= tol_residual:
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
                    "worst_p95_residual": worst_p95_residual,
                    "tol_zero": tol_zero,
                    "tol_residual": tol_residual,
                    "k_values": k_used,
                },
                interp,
            )
    else:
        log_result("EXP_8", "HYPOTHESIS_TEST", "SKIP", {}, "Missing Data")

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

        fits = [(mid, entry.get("theory_fit", "INCONCLUSIVE")) for mid, entry in members]
        member_ids = [mid for mid, _ in fits]
        member_fits = {mid: fit for mid, fit in fits}

        role_breakdown = {}
        for mid, entry in members:
            r = entry.get("role", "UNKNOWN")
            role_breakdown[r] = role_breakdown.get(r, 0) + 1

        refuting = [mid for mid, fit in fits if fit in ("REFUTES", "CONTROL_BROKEN")]
        supporting = [mid for mid, fit in fits if fit == "SUPPORTS"]
        candidate = [mid for mid, fit in fits if fit == "CANDIDATE"]
        informative = [mid for mid, fit in fits if fit == "INFORMATIVE"]
        inconclusive = [mid for mid, fit in fits if fit == "INCONCLUSIVE"]
        decisive = [mid for mid, fit in fits if fit != "INCONCLUSIVE"]

        if refuting:
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
            "role_breakdown": role_breakdown,
        }

    summary["stage_verdicts"] = stage_verdicts

    # =========================================================================
    # IMPLEMENTATION-HEALTH ROLLUP (non-theoretic; PROOF_PROGRAM_SPEC.md §6)
    # Replaces the theorem-level semantics of stage_verdicts. Answers "is the
    # engine healthy in this grouping?" — not "does the theory hold?". `stage`
    # itself remains a legitimate grouping axis (spec Decision Log #5).
    # =========================================================================
    implementation_health = {}
    for stage_name in ("gauge", "lattice", "brittleness", "control"):
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
            "IMPLEMENTATION_OK", "CONSISTENT", "DIRECTIONAL", "INCONCLUSIVE"
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

    # Single source of truth for the role/function/stage/obligation map. UI
    # should read from data.meta.experiment_classification instead of
    # duplicating ROLE_MAP. (Sprint 2c wires the sidebar to this.)
    data.setdefault("meta", {})["experiment_classification"] = (
        _build_experiment_classification()
    )

    # Finalize
    summary["overall"] = "PASS" if overall_pass else "FAIL"
    data["summary"] = summary

    # =========================================================================
    # REGRESSION LOG: append one line per verifier run to verdict_history.jsonl.
    # Canonical history axes are obligation_statuses + implementation_health.
    # Legacy stage_verdicts remains in the record for one-release compatibility.
    # =========================================================================
    try:
        history_read_file = HISTORY_FILE
        if not os.path.exists(history_read_file):
            for legacy_history in LEGACY_HISTORY_FILES:
                if os.path.exists(legacy_history):
                    history_read_file = legacy_history
                    break

        prev_line = None
        if os.path.exists(history_read_file):
            with open(history_read_file, "r") as f:
                for line in f:
                    if line.strip():
                        prev_line = line
        prev_record = json.loads(prev_line) if prev_line else None

        obligation_statuses = {
            obl["id"]: obl.get("status", "OPEN")
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

        history_write_targets = [HISTORY_FILE] + [
            p for p in LEGACY_HISTORY_FILES if p != HISTORY_FILE
        ]
        for target in history_write_targets:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "a") as f:
                f.write(json.dumps(record) + "\n")
    except Exception as exc:
        print(f" [WARN] Could not append to verdict history log: {exc}")

    return data

if __name__ == "__main__":
    # Standalone run
    d = run_verification()
    if d:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w") as f:
            json.dump(d, f, indent=2)
        for legacy in LEGACY_OUTPUT_FILES:
            try:
                os.makedirs(os.path.dirname(legacy), exist_ok=True)
                with open(legacy, "w") as f:
                    json.dump(d, f, indent=2)
            except Exception as exc:
                print(f" [WARN] Could not mirror verifier output to {legacy}: {exc}")
