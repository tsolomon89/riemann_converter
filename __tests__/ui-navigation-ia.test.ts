import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf-8");

describe("UI navigation information architecture", () => {
    const page = read("app/page.tsx");
    const intro = read("components/IntroPanel.tsx");
    const audit = read("docs/ui_navigation_audit.md");

    it("exposes the primary research-instrument sections in top navigation", () => {
        for (const label of ["Run", "Results", "Proof Discovery", "Certificate", "Data", "How to Read"]) {
            expect(page).toContain(`label: "${label}"`);
        }
        for (const section of [
            "RUN",
            "RESULTS",
            "PROOF_DISCOVERY",
            "CERTIFICATE",
            "DATA",
            "ABOUT",
        ]) {
            expect(page).toContain(section);
        }
    });

    it("keeps proof discovery, data/preflight, certificate, and reading guide reachable", () => {
        expect(page).toContain("ProofDiscoveryIndexPanel");
        expect(page).toContain("proof-discovery-section");
        expect(page).toContain("DataReadinessPanel");
        expect(page).toContain("data-section");
        expect(page).toContain("certificate-section");
        expect(page).toContain("intro-panel-section");
    });

    it("links formerly hidden experiment screens into experiment tabs", () => {
        expect(page).toContain('{ id: "EXP0", label: "ZETA-0"');
        expect(page).toContain('{ id: "EXP10", label: "TRANS-1"');
        expect(page).toContain("renderExperiment0()");
        expect(page).toContain("renderExperiment10()");
    });

    it("frames the reading guide as proof discovery, not theorem verdicts", () => {
        expect(intro).toContain("proof-discovery instrument, not a theorem oracle");
        expect(intro).toContain("turn experiments into candidate lemmas, failed baselines, revised");
        expect(intro).toContain("What baseline was tested?");
        expect(intro).toContain("What formal proof obligation remains?");
        expect(intro).toContain("The Same-Object Certificate");
        expect(intro).toContain("NC3");
        expect(intro).toContain("NC4");
    });

    it("documents reachability and developer-only surfaces", () => {
        expect(audit).toContain('"name": "Proof Discovery Index"');
        expect(audit).toContain('"name": "Candidate Lemma View"');
        expect(audit).toContain('"name": "Data & Preflight"');
        expect(audit).toContain('"name": "Same-Object Certificate"');
        expect(audit).toContain('"name": "MCP route"');
        expect(audit).toContain('"recommended_action": "developer_only"');
    });

    it("does not use stale broad verdict copy in active UI source", () => {
        const activeUi = [
            read("app/page.tsx"),
            read("app/layout.tsx"),
            ...fs
                .readdirSync(path.join(root, "components"))
                .filter((file) => file.endsWith(".tsx"))
                .map((file) => read(path.join("components", file))),
        ].join("\n");

        for (const stale of [
            "supports the theory",
            "refutes the theory",
            "theory passed",
            "theory failed",
            "proves RH",
            "RH proved",
            "same-object proved",
            "zeta invariant",
            "zero reuse false",
            "consistent with model",
            "This is consistent with",
        ]) {
            expect(activeUi).not.toContain(stale);
        }
    });
});
