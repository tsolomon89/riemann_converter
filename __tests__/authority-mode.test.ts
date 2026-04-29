import { readArtifact } from "../lib/research-service";

describe("authority mode envelopes", () => {
    afterEach(() => {
        jest.dontMock("../lib/research-service");
    });

    it("PENDING_SIGNOFF keeps provisional fields on witness-bearing payloads", async () => {
        const base = readArtifact();
        const pending = JSON.parse(JSON.stringify(base));
        pending.summary = pending.summary ?? {};
        pending.summary.proof_program = pending.summary.proof_program ?? {};
        pending.summary.proof_program.witness_map_review =
            pending.summary.proof_program.witness_map_review ?? {};
        pending.summary.proof_program.witness_map_review.status = "PENDING_SIGNOFF";

        jest.resetModules();
        jest.doMock("../lib/research-service", () => ({
            readArtifact: () => pending,
            readHistory: () => [],
            resolveWitnessMapStatus: () => "PENDING_SIGNOFF",
        }));
        const api = await import("../lib/research-api");
        const env = api.getObligationsEnvelope();
        expect(env.authority.witness_map_status).toBe("PENDING_SIGNOFF");
        expect(env.authority.authoritative).toBe(false);
        expect(env.authority.provisional_fields.length).toBeGreaterThan(0);
    });

    it("SIGNED_OFF upgrades authority without changing payload shape", () => {
        const base = readArtifact();
        const signed = JSON.parse(JSON.stringify(base));
        signed.summary = signed.summary ?? {};
        signed.summary.proof_program = signed.summary.proof_program ?? {};
        signed.summary.proof_program.witness_map_review =
            signed.summary.proof_program.witness_map_review ?? {};
        signed.summary.proof_program.witness_map_review.status = "SIGNED_OFF";

        return (async () => {
            jest.resetModules();
            jest.doMock("../lib/research-service", () => ({
                readArtifact: () => signed,
                readHistory: () => [],
                resolveWitnessMapStatus: () => "SIGNED_OFF",
            }));
            const api = await import("../lib/research-api");
            const env = api.getObligationsEnvelope();
            expect(env).toHaveProperty("data.obligations");
            expect(env.authority.witness_map_status).toBe("SIGNED_OFF");
            expect(env.authority.authoritative).toBe(true);
            expect(env.authority.provisional_fields).toEqual([]);
        })();
    });
});
