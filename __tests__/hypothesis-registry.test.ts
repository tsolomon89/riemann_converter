import path from "path";
import {
    REQUIRED_EXPERIMENT_IDS,
    clearHypothesisRegistryCache,
    getBaselineForExperiment,
    hypothesisCoverageReport,
    listBaselineHypotheses,
    loadHypothesisRegistry,
} from "../lib/hypothesis-registry";

const repoRoot = path.resolve(__dirname, "..");

beforeEach(() => clearHypothesisRegistryCache());

describe("hypothesis registry coverage", () => {
    it("covers every required experiment with a baseline hypothesis", () => {
        const report = hypothesisCoverageReport(repoRoot);
        expect(report.missing).toEqual([]);
        expect(report.covered).toBe(true);
        expect(report.total).toBeGreaterThanOrEqual(REQUIRED_EXPERIMENT_IDS.length);
    });

    it.each(REQUIRED_EXPERIMENT_IDS)(
        "%s has a baseline hypothesis with required fields",
        (expId) => {
            const baseline = getBaselineForExperiment(expId, repoRoot);
            expect(baseline).not.toBeNull();
            const hyp = baseline!;
            expect(hyp.hypothesis_id).toMatch(/^HYP_/);
            expect(hyp.display_id).toBeTruthy();
            expect(hyp.plain_statement.length).toBeGreaterThan(0);
            expect(hyp.object_under_test.length).toBeGreaterThan(0);
            expect(hyp.expected_signature.primary_metric.length).toBeGreaterThan(0);
            expect(hyp.expected_signature.pass_rule.length).toBeGreaterThan(0);
            expect(hyp.failure_means.length).toBeGreaterThan(0);
            expect(hyp.failure_does_not_mean.length).toBeGreaterThan(0);
            expect(hyp.possible_alternative_hypotheses.length).toBeGreaterThan(0);
        },
    );

    it("loads from all five role-based registry files", () => {
        const reg = loadHypothesisRegistry(repoRoot);
        expect(reg.sources).toEqual(
            expect.arrayContaining([
                "program_1.json",
                "program_2.json",
                "controls.json",
                "pathfinders.json",
                "demonstrations.json",
            ]),
        );
    });

    it("preserves role separation", () => {
        const all = listBaselineHypotheses(repoRoot);
        const witnesses = all.filter((h) => h.role === "witness");
        const controls = all.filter((h) => h.role === "control");
        const pathfinders = all.filter((h) => h.role === "pathfinder");
        const demos = all.filter((h) => h.role === "demonstration" || h.role === "visualization");

        const program1Witnesses = witnesses.filter((h) => h.program === "PROGRAM_1");
        const program2Witnesses = witnesses.filter((h) => h.program === "PROGRAM_2");

        expect(program1Witnesses.map((h) => h.display_id).sort()).toEqual(
            ["CORE-1", "VAL-1", "WIT-1"].sort(),
        );
        expect(program2Witnesses.map((h) => h.display_id).sort()).toEqual(
            ["P2-1", "P2-2", "P2-3"].sort(),
        );
        expect(controls.map((h) => h.display_id).sort()).toEqual(
            ["CTRL-1", "CTRL-2"].sort(),
        );
        expect(pathfinders.length).toBeGreaterThanOrEqual(2);
        expect(demos.length).toBeGreaterThanOrEqual(2);
    });

    it("contains disallowed conclusions for theory-bearing experiments", () => {
        const all = listBaselineHypotheses(repoRoot);
        const witnesses = all.filter((h) => h.role === "witness");
        for (const hyp of witnesses) {
            expect(hyp.disallowed_conclusions ?? []).not.toEqual([]);
        }
    });
});
