# UI Navigation Audit

Date: 2026-05-07

Scope: user-facing routes, screens, panels, tabs, proof-discovery surfaces, run/preflight/data screens, certificate screens, and developer/API browser surfaces in `tsolomon89/riemann_converter`.

## Summary

The app is a single-page Next.js instrument at `/`. There are API and MCP routes, but no separate user-facing page routes beyond the home instrument. The primary IA is now exposed through top navigation buttons:

- Run
- Results
- Proof Discovery
- Certificate
- Data
- How to Read

The historical experiment-tab row remains as the results navigation. Previously orphaned experiment renderers for `ZETA-0` (`EXP0`) and `TRANS-1` (`EXP10`) are now reachable from the experiment tabs. Proof-discovery and data/preflight APIs are now surfaced by first-class panels rather than requiring API/MCP access.

## Records

```json
[
  {
    "name": "Home research instrument",
    "path_or_component": "/ -> app/page.tsx",
    "purpose": "Single-page research instrument for run configuration, experiment results, proof discovery, data/certificate state, and reading guide.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Run",
    "path_or_component": "top nav Run -> #experiment-sidebar-section / ExperimentSidebar",
    "purpose": "Current run controls, preset selection, experiment selection, preflight summary, selected data source, run status, live telemetry, and run logs.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Results",
    "path_or_component": "top nav Results -> #active-experiment-header / renderExperiment*",
    "purpose": "Primary experiment result workspace with charts, experiment review, model comparison, candidate lemmas, and execution logs.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Program 1 Overview",
    "path_or_component": "#header-program-1-label / pageViewMode=PROGRAM_1_OVERVIEW",
    "purpose": "Overview containing proof program map, proof discovery index, reading guide, certificate, research path, data/preflight, and open gaps.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Proof Program Map",
    "path_or_component": "components/ProofProgramMap.tsx -> #proof-program-section",
    "purpose": "Theorem target, obligation ladder, Program 1 vs Program 2 lanes, open gap chips, and implementation-health aggregate.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Proof Discovery Index",
    "path_or_component": "components/ProofDiscoveryIndexPanel.tsx -> #proof-discovery-section",
    "purpose": "Index for experiment reviews, candidate lemmas, formalization targets, failed/incomplete baselines, baseline registry coverage, and proposed baseline updates.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "How to Read This Instrument",
    "path_or_component": "components/IntroPanel.tsx -> #intro-panel-section",
    "purpose": "Current reading guide: experiment -> baseline -> raw observation -> model comparison -> candidate lemma -> proof obligation.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Same-Object Certificate",
    "path_or_component": "components/SameObjectCertificatePanel.tsx -> #certificate-section",
    "purpose": "Finite Same-Object proxy certificate, reconstruction agreement, zero correspondence, predicate preservation, controls, freshness/missing state, and remaining formal step.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Research Path / Next Action",
    "path_or_component": "components/ResearchPathPanel.tsx -> #research-path-section",
    "purpose": "Recommended next action, data readiness summary, precision policy, current node, stop condition, and research plan status.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Data & Preflight",
    "path_or_component": "components/DataReadinessPanel.tsx -> #data-section",
    "purpose": "Canonical zero, prime, tau, and trivial-zero assets; overkill preflight; selected data sources; zero validation; Odlyzko/reference cross-check; certificate artifact freshness.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Open Gaps",
    "path_or_component": "components/OpenGapsPanel.tsx -> #open-gaps-section",
    "purpose": "Named formal gaps, including NC3/NC4 blockers and other proof-program gaps.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Verdict History",
    "path_or_component": "components/VerdictHistoryPanel.tsx -> #history-section",
    "purpose": "Historical run comparison when enabled; currently suppressed while current-run reporting disables historical comparison.",
    "reachable_from_top_nav": false,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Experiment Review",
    "path_or_component": "components/ExperimentReviewPanel.tsx -> #active-experiment-header",
    "purpose": "Per-experiment baseline hypothesis, actual run inference, model comparison, candidate lemma, next hypothesis, intended-if-confirmed rails, and disallowed conclusions.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Model Comparison",
    "path_or_component": "components/ModelComparisonPanel.tsx nested in ExperimentReviewPanel",
    "purpose": "Predicted baseline, pass rule, failed metrics, baseline status, review priority, and alternative model candidates.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Candidate Lemma View",
    "path_or_component": "components/CandidateLemmaPanel.tsx nested in ExperimentReviewPanel and indexed by ProofDiscoveryIndexPanel",
    "purpose": "Candidate lemmas, alternative directions, scope, and what each lemma does not prove.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Experiment Sidebar",
    "path_or_component": "components/ExperimentSidebar.tsx",
    "purpose": "Run preset/preflight, function/stage grouped experiment selection, data-source selection, parameters, run summary, and live processing telemetry.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "ZETA-0 Critical Line Polar Trace",
    "path_or_component": "renderExperiment0 / nav-tab-exp0",
    "purpose": "Zeta-direct descriptive visualization and dual-window overlay; orientation only.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "CORE-1 Harmonic Converter",
    "path_or_component": "renderExperiment1 / nav-tab-exp1",
    "purpose": "Main Riemann Converter reconstruction view with harmonic/Mobius branches, lattice/overlay modes, active k controls, and support diagnostics.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "CTRL-1 Operator Scaling Control",
    "path_or_component": "renderExperiment1B / nav-tab-exp1b",
    "purpose": "Known-wrong gamma/rho operator scaling controls that arm the instrument when detected.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "NOTE-1 Zero-Reuse Note",
    "path_or_component": "renderExperiment1C / nav-tab-exp1c",
    "purpose": "Zero-reuse / zero-scaling engineering note and coherence check.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "P2-1 Rogue Centrifuge",
    "path_or_component": "renderExperiment2 / nav-tab-exp2",
    "purpose": "Program 2 detectability route diagnostic for planted off-line perturbations.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "P2-2 Rogue Isolation",
    "path_or_component": "renderExperiment2B / nav-tab-exp2b",
    "purpose": "Program 2 single-perturbed-zero baseline comparison and residual track.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "CTRL-2 Beta Counterfactual Control",
    "path_or_component": "renderExperiment3 / nav-tab-exp3",
    "purpose": "Known-wrong beta assumption control; detects wrong beta cases.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "PATH-1 Translation vs Dilation",
    "path_or_component": "renderExperiment4 / Exp4Chart / nav-tab-exp4",
    "purpose": "Pathfinder selecting which transform family to prioritize.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "PATH-2 Zero Correspondence",
    "path_or_component": "renderExperiment5 / Exp5Chart / nav-tab-exp5",
    "purpose": "Pathfinder for scaled-zero correspondence metrics and nearest-neighbor structure.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "VAL-1 Beta Stability",
    "path_or_component": "renderExperiment6 / Exp6Chart / nav-tab-exp6",
    "purpose": "Program 1 finite proxy for beta/predicate stability under tested gauge scales.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "P2-3 Calibrated Amplification",
    "path_or_component": "renderExperiment7 / Exp7Chart / nav-tab-exp7",
    "purpose": "Program 2 amplification sensitivity sweep; route signal only.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "WIT-1 Zero Scaling Witness",
    "path_or_component": "renderExperiment8 / Exp8Chart / nav-tab-exp8",
    "purpose": "Program 1 zero-scaling witness and finite correspondence metrics.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "DEMO-1 Bounded View",
    "path_or_component": "renderExperiment9 / nav-tab-exp9",
    "purpose": "Demonstration of bounded-window mechanics conditional on transport.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "TRANS-1 Zeta Gauge Transport",
    "path_or_component": "renderExperiment10 / nav-tab-exp10",
    "purpose": "Zeta-direct transport residual guardrail and base comparison; informational pathfinder.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Run status/logs API",
    "path_or_component": "/api/research/run, /api/research/run/logs, /api/research/run/events",
    "purpose": "Machine-readable run control, status, logs, events, cancel, and resume endpoints used by the sidebar.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "developer_only"
  },
  {
    "name": "Research data/preflight APIs",
    "path_or_component": "/api/research/data-assets, /api/research/preflight, /api/research/selected-data-source, /api/research/zero-validation",
    "purpose": "Machine-readable data assets, selected sources, preflight, and zero-validation contracts. DataReadinessPanel surfaces registry/preflight validation state without auto-running the raw zero-validation endpoint.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Proof discovery APIs",
    "path_or_component": "/api/research/proof-discovery, /experiment-reviews, /model-comparisons, /candidate-lemmas, /baseline-hypotheses, /hypothesis-proposals",
    "purpose": "Machine-readable proof-discovery artifacts used by ProofDiscoveryIndexPanel and ExperimentReviewPanel.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "Certificate API",
    "path_or_component": "/api/research/same-object-certificate and /api/research/artifact-freshness?artifact_kind=certificate",
    "purpose": "Machine-readable certificate payload and freshness status surfaced by certificate and data panels.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "keep_and_link"
  },
  {
    "name": "MCP route",
    "path_or_component": "/mcp",
    "purpose": "JSON-RPC tool endpoint for agents and integrations. Not intended as an end-user screen.",
    "reachable_from_top_nav": false,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "developer_only"
  },
  {
    "name": "Legacy rerun route",
    "path_or_component": "/api/rerun",
    "purpose": "Read-only compatibility route covered by tests. Superseded by /api/research/run.",
    "reachable_from_top_nav": false,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": false,
    "recommended_action": "developer_only"
  },
  {
    "name": "Legacy RerunButton component",
    "path_or_component": "components/RerunButton.tsx",
    "purpose": "Older run-control widget, currently not imported by app/page.tsx. Kept for compatibility/reference.",
    "reachable_from_top_nav": false,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": true,
    "recommended_action": "developer_only"
  },
  {
    "name": "PrimeStepperChart component",
    "path_or_component": "components/PrimeStepperChart.tsx",
    "purpose": "Chart helper for prime-step visualizations, currently not imported by the main app.",
    "reachable_from_top_nav": false,
    "reachable_from_sidebar": false,
    "reachable_from_experiment_tab": false,
    "orphaned": true,
    "recommended_action": "developer_only"
  },
  {
    "name": "InferenceRailsCallout component",
    "path_or_component": "components/VerdictBadges.tsx::InferenceRailsCallout",
    "purpose": "Reusable inference-rails callout. The active experiment review renders equivalent rails directly.",
    "reachable_from_top_nav": true,
    "reachable_from_sidebar": true,
    "reachable_from_experiment_tab": true,
    "orphaned": false,
    "recommended_action": "merge"
  }
]
```

## Manual QA Notes

- Proof Discovery is reachable from the top nav and renders `#proof-discovery-index-panel`.
- Candidate lemmas are reachable from the Proof Discovery index and from every experiment review.
- Data/preflight and zero validation are reachable from the top nav and render `#data-readiness-panel`.
- Same-Object Certificate is reachable from the top nav and renders `#same-object-certificate-panel`.
- Experiment reviews are reachable from experiment tabs, including formerly hidden `ZETA-0` and `TRANS-1`.
- MCP and raw API routes are marked developer-only unless surfaced by a user-facing panel.
