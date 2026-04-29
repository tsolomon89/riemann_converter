import {
    applyParameterPatch,
    applyPresetDefaults,
    applySelectionPatch,
    buildRunSummaryView,
    getExecuteButtonState,
    hasPerturbationSelection,
    type ExperimentConfig,
} from "../components/ExperimentSidebar";

describe("experiment sidebar config semantics", () => {
    const baseConfig: ExperimentConfig = {
        runPreset: "custom",
        selectedExperiments: ["1"],
        zeroSource: "generated",
        zeroCount: 20000,
        dps: 50,
        resolution: 500,
        xStart: 2,
        xEnd: 50,
        betaOffset: 0.0001,
        kPower: -20,
        primeMinCount: 0,
        primeTargetCount: 0,
    };

    it("applies preset parameters without changing selected experiments", () => {
        const config: ExperimentConfig = {
            ...baseConfig,
            selectedExperiments: ["1", "2b"],
            dps: 33,
            zeroCount: 123,
        };

        const next = applyPresetDefaults(config, "smoke");

        expect(next.runPreset).toBe("smoke");
        expect(next.selectedExperiments).toEqual(["1", "2b"]);
        expect(next.dps).toBe(30);
        expect(next.zeroCount).toBe(100);
    });

    it("forces runPreset to custom when editing parameters", () => {
        const config: ExperimentConfig = {
            ...baseConfig,
            runPreset: "overkill",
        };

        const next = applyParameterPatch(config, {
            dps: 60,
            workers: 7,
        });

        expect(next.runPreset).toBe("custom");
        expect(next.dps).toBe(60);
        expect(next.workers).toBe(7);
    });

    it("keeps runPreset when only experiment selection changes", () => {
        const config: ExperimentConfig = {
            ...baseConfig,
            runPreset: "authoritative",
            selectedExperiments: ["1"],
        };

        const next = applySelectionPatch(config, ["2", "2B", "2", "7"]);

        expect(next.runPreset).toBe("authoritative");
        expect(next.selectedExperiments).toEqual(["2", "2b", "7"]);
    });

    it("disables execute when no experiments are selected", () => {
        const state = getExecuteButtonState({
            runControlsEnabled: true,
            isRunning: false,
            selectedCount: 0,
        });

        expect(state.disabled).toBe(true);
        expect(state.label).toBe("SELECT EXPERIMENT(S)");
    });

    it("shows perturbation controls only for exp 2, 2b, or 7 selections", () => {
        expect(hasPerturbationSelection(["1", "4"])).toBe(false);
        expect(hasPerturbationSelection(["1", "2"])).toBe(true);
        expect(hasPerturbationSelection(["2b"])).toBe(true);
        expect(hasPerturbationSelection(["7", "8"])).toBe(true);
    });

    it("builds run summary fields from config", () => {
        const summary = buildRunSummaryView({
            ...baseConfig,
            runPreset: "overkill_full",
            selectedExperiments: ["2b", "7"],
            zeroSource: "file:data/zeros/nontrivial/zeros_100K_three_ten_power_neg_nine.gz",
            dps: 80,
            zeroCount: 20000,
            workers: 6,
            primeMinCount: 1_000_000,
            primeTargetCount: 7_000_000,
        });

        expect(summary).toEqual({
            preset: "overkill_full",
            experiments: "2b,7",
            zero_source: "odlyzko_100k",
            dps: 80,
            zero_count: 20000,
            workers: "6",
            prime_min_count: 1_000_000,
            prime_target_count: 7_000_000,
        });
    });
});
