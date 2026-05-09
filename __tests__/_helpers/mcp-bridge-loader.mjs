// Long-lived Node child that loads ../mcp-bridge.mjs natively and serves
// newline-delimited JSON requests over stdin → stdout. Lets the Jest test
// exercise the ESM bridge without `--experimental-vm-modules`.
//
// Protocol:
//   IN  -> { id, op, args? }    one JSON object per line on stdin
//   OUT -> { id, ok, result }   one JSON object per line on stdout (ok=true)
//          { id, ok, error }    on failure (ok=false)
//
// Operations:
//   has_tool(set, name)         -> boolean
//   tool_set_size(set)          -> number
//   tool_set_to_array(set)      -> string[]
//   fallback_payload(name, args)-> any
//   try_fallback(req)           -> { handled: boolean, captured: string[] }
//   normalize_http_response(req, text) -> string

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgeUrl = pathToFileURL(path.resolve(__dirname, "..", "..", "mcp-bridge.mjs")).href;
const bridgeModule = await import(bridgeUrl);
const T = bridgeModule.__test__;

const setByName = (name) => {
    if (name === "READ_ONLY_TOOLS") return T.READ_ONLY_TOOLS;
    if (name === "RUN_CONTROL_TOOLS") return T.RUN_CONTROL_TOOLS;
    if (name === "MUTATION_TOOLS") return T.MUTATION_TOOLS;
    throw new Error(`unknown tool set: ${name}`);
};

const dispatch = (op, args) => {
    switch (op) {
        case "has_tool": {
            const [setName, toolName] = args;
            return setByName(setName).has(toolName);
        }
        case "tool_set_size": {
            const [setName] = args;
            return setByName(setName).size;
        }
        case "tool_set_to_array": {
            const [setName] = args;
            return Array.from(setByName(setName));
        }
        case "fallback_payload": {
            const [name, payload] = args;
            return T.fallbackPayload(name, payload || {});
        }
        case "try_fallback": {
            const [req] = args;
            const captured = [];
            const orig = console.log;
            console.log = (s) => captured.push(typeof s === "string" ? s : String(s));
            let handled;
            try {
                handled = T.tryFallback(req);
            } finally {
                console.log = orig;
            }
            return { handled, captured };
        }
        case "normalize_http_response": {
            const [req, text] = args;
            return T.normalizeHttpMcpResponseText(req, text);
        }
        default:
            throw new Error(`unknown op: ${op}`);
    }
};

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
    if (!line.trim()) return;
    let req;
    try {
        req = JSON.parse(line);
    } catch (err) {
        process.stdout.write(JSON.stringify({ id: null, ok: false, error: `bad json: ${err.message}` }) + "\n");
        return;
    }
    try {
        const result = dispatch(req.op, req.args || []);
        process.stdout.write(JSON.stringify({ id: req.id, ok: true, result }) + "\n");
    } catch (err) {
        process.stdout.write(JSON.stringify({ id: req.id, ok: false, error: err && err.message ? err.message : String(err) }) + "\n");
    }
});

rl.on("close", () => process.exit(0));
process.stdout.write(JSON.stringify({ id: "ready", ok: true, result: "ready" }) + "\n");
