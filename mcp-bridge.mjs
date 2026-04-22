import readline from "node:readline";

const MCP_URL = process.env.MCP_BRIDGE_URL || "http://127.0.0.1:7000/mcp";
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.MCP_BRIDGE_TIMEOUT_MS || "30000", 10);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

const emitJsonRpcError = (req, message, data = undefined) => {
    const payload = {
        jsonrpc: "2.0",
        id: req?.id ?? null,
        error: {
            code: -32099,
            message,
            ...(data !== undefined ? { data } : {})
        }
    };
    console.log(JSON.stringify(payload));
};

rl.on("line", async (line) => {
    if (!line.trim()) return;
    let req;
    try {
        req = JSON.parse(line);
        const headers = { "Content-Type": "application/json" };
        if (process.env.RESEARCH_RUN_TOKEN) {
            headers["Authorization"] = `Bearer ${process.env.RESEARCH_RUN_TOKEN}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        
        let res;
        try {
            res = await fetch(MCP_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(req),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
        
        if (!res.ok) {
            const err = await res.text();
            console.error(`HTTP Error: ${res.status} - ${err}`);
            emitJsonRpcError(req, `MCP endpoint returned HTTP ${res.status}.`, {
                endpoint: MCP_URL,
                response: err
            });
            return;
        }

        const data = await res.text();
        // Send the JSON-RPC response back to stdout
        console.log(data);
    } catch (e) {
        console.error("Bridge Error:", e);
        emitJsonRpcError(req, "Bridge fetch failed.", {
            endpoint: MCP_URL,
            cause: e instanceof Error ? e.message : String(e)
        });
    }
});
