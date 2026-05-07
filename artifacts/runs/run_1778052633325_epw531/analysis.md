---
run_id: run_1778052633325_epw531
created_at: 2026-05-07T13:02:10.015048Z
schema_version: 2026.05.run-artifact.v1
source_artifact_hash: 2ed04f46a3747e6a541e199aedf3aa8b464253b893cc1a9109b01596bb7df466
artifact_kind: analysis
---

# Run Identity
run_id: run_1778052633325_epw531

# Data and Precision
{
  "certificate_fidelity": "ELIGIBLE_WITH_WARNINGS",
  "compute_fidelity": "AUTHORITATIVE",
  "data_fidelity": "READY_WITH_WARNINGS",
  "data_sufficiency_status": "READY",
  "warnings": [
    "Generated 60K zero source is accepted for this baseline run but remains below dps+guard certificate preference."
  ]
}

# Program 1 Proxy Witnesses
{
  "EXP_0": "PASS",
  "EXP_1": "WITNESS_PASS",
  "EXP_10": "PASS",
  "EXP_1B": "CONTROL_ARMED",
  "EXP_1C": "FAIL",
  "EXP_3": "CONTROL_ARMED",
  "EXP_4": "PATHFINDER_INCONCLUSIVE",
  "EXP_5": "PATHFINDER_RESULT",
  "EXP_6": "WITNESS_PASS",
  "EXP_8": "WITNESS_PASS",
  "EXP_9": "PASS"
}

# Controls
{
  "EXP_1B": "CONTROL_ARMED",
  "EXP_3": "CONTROL_ARMED"
}

# Program 2 Contradiction Track
Program 2 is mixed and remains route-unresolved. This does not refute Program 1.

# Same-Object Certificate
Status: SAME_OBJECT_PROXY_CANDIDATE

# Proof-Kernel Status
CANDIDATE

# Formal Gaps
[
  {
    "blocker_for": [
      "OBL_EXACT_RH_TRANSPORT"
    ],
    "description": "Exact transport of the RH predicate under the gauge is not proved, only witnessed.",
    "id": "GAP_RH_PREDICATE_TRANSPORT",
    "title": "Exact transport of the RH predicate"
  },
  {
    "description": "Whether tau is structurally singled out, or whether any c > 1 would serve. Not a proof obligation \u2014 a parked research question outside the critical path.",
    "id": "GAP_TAU_UNIQUENESS",
    "title": "Uniqueness of tau as the gauge base"
  },
  {
    "blocker_for": [
      "OBL_NO_HIDING_UNDER_COMPRESSION"
    ],
    "description": "Heuristic argument that a rogue zero at ordinate ~10^9999 cannot hide under compression; no formal non-hiding theorem.",
    "id": "GAP_NO_HIDING_UNDER_COMPRESSION",
    "title": "No hiding under compression"
  },
  {
    "blocker_for": [
      "OBL_ROGUE_DETECTABILITY"
    ],
    "description": "The contradiction-by-detectability route lacks a formal amplification theorem.",
    "id": "GAP_PROGRAM2_FORMALIZATION",
    "title": "Formal detectability theorem for the Contradiction Track"
  },
  {
    "blocker_for": [
      "OBL_CONTRADICTION_CLOSURE"
    ],
    "description": "The contradiction route lacks a formal closure artifact showing that detectability plus no-hiding plus a verified bounded view forces the intended contradiction.",
    "id": "GAP_CONTRADICTION_CLOSURE",
    "title": "Contradiction closure proof"
  },
  {
    "description": "The mapping of experiments to obligations (PROOF_PROGRAM_SPEC \u00a77) is provisional. Sprint 3b.0 witness-map review must be signed off before API/schema contracts treat witness mappings as authoritative.",
    "id": "GAP_WITNESS_MAP_REVIEW",
    "title": "Provisional witness map"
  }
]

# Recommended Next Action
RECOMMEND_NC3_NC4_FORMALIZATION

# What This Shows
Current-run proxy witnesses and controls only; no stale certificate data is used.

# What This Does Not Show
This does not prove RH and does not turn passing witnesses into proof.
