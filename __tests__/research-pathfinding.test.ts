import { GET } from "../app/api/research/[...segments]/route";
import { POST as MCP_POST } from "../app/mcp/route";

const ctx = (...segments: string[]) => ({ params: { segments } });

const parse = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

const mcpCall = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await MCP_POST(
        new Request("http://localhost/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name, arguments: args },
            }),
        }),
    );
    return res.json();
};

describe("research pathfinding API and MCP surfaces", () => {
    it("exposes data assets, sufficiency, plan, next action, and precision policy routes", async () => {
        for (const route of [
            "data-assets",
            "data-sufficiency",
            "research-plan",
            "next-action",
            "precision-policy",
            "data-migration-report",
        ]) {
            const body = await parse(
                await GET(new Request(`http://localhost/api/research/${route}`), ctx(route)),
            );
            expect(body).toHaveProperty("authority");
            expect(body).toHaveProperty("capabilities");
            expect(body).toHaveProperty("data");
        }
    });

    it("MCP exposes matching next-action tools", async () => {
        const listed = await MCP_POST(
            new Request("http://localhost/mcp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/list",
                    params: {},
                }),
            }),
        );
        const body = await listed.json();
        const names = ((body.result?.tools ?? []) as Array<{ name?: string }>).map((tool) => tool.name);
        for (const name of [
            "get_data_assets",
            "check_data_sufficiency",
            "get_precision_policy",
            "get_research_plan",
            "get_next_action",
            "explain_why_this_experiment_next",
            "explain_why_stop_experimenting",
            "get_data_migration_report",
        ]) {
            expect(names).toContain(name);
        }
    });

    it("MCP next action returns the same structured semantics as the HTTP route", async () => {
        const http = await parse(
            await GET(new Request("http://localhost/api/research/next-action"), ctx("next-action")),
        );
        const mcp = await mcpCall("get_next_action");
        expect(mcp.result.data.next.next_action).toBe(
            (http.data as { next: { next_action: string } }).next.next_action,
        );
    });
});
