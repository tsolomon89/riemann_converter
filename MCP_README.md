# Model Context Protocol (MCP) in the Riemann Converter

This document explains how the Model Context Protocol (MCP) is integrated into the `riemann_converter` project. It serves as a guide for understanding the architecture, the tools exposed to AI agents (like Claude or Cursor), and how to configure your environment to interact with the project's state.

---

## 1. Introduction: The "Thin Wrapper" Architecture

The core design philosophy for MCP in this project is that **the MCP layer is a thin protocol wrapper over the HTTP API**. 

Instead of building domain logic directly into the MCP server, the system exposes its state and capabilities via standard Next.js API routes (in `lib/research-api` and `/api/research`). The MCP bridge then maps JSON-RPC requests from AI agents to these HTTP endpoints.

This enforces a strict and unified ontology: there is no `SUPPORTS`/`REFUTES` vocabulary at the tool boundary. Agents consume the exact same payload structures that the frontend or a human researcher would consume.

### Infrastructure MCP vs. Research-Domain MCP
There are two distinct MCP concerns in the ecosystem:
1. **Infrastructure MCP:** Vercel's official MCP server (`https://mcp.vercel.com`). This is used for inspecting deployments, reading server logs, and infrastructure management.
2. **Research-Domain MCP:** *This project's MCP*. It exposes the mathematical logic, proof gaps, and experiment results specific to the Riemann converter.

This document covers the **Research-Domain MCP**.

---

## 2. System Architecture

Data flows from the AI agent to the Riemann backend via a `stdio`-to-HTTP bridge.

```mermaid
flowchart LR
    A[AI Agent (Claude/Cursor)] -- stdio --> B[mcp-bridge.mjs]
    B -- JSON-RPC over HTTP --> C[Next.js App (/mcp)]
    C -- lib/research-api --> D[(Database / State)]
```

1. The AI Agent spawns `mcp-bridge.mjs` as a local child process.
2. The agent communicates with the bridge via `stdio` using the MCP JSON-RPC spec.
3. The bridge forwards these requests to the actual Next.js application (either running locally or deployed on Vercel) over HTTP.

---

## 3. The Stdio-to-HTTP Bridge (`mcp-bridge.mjs`)

The bridge script is located at the root of the repository (`mcp-bridge.mjs`). Since AI agents like Claude Desktop natively support `stdio` transports, this script acts as a universal adapter to connect them to the streamable HTTP endpoints of the Next.js app.

### Endpoint Resolution
When an agent sends a tool request, the bridge attempts to resolve the destination in the following order:
1. `MCP_BRIDGE_URL`: If explicitly set, it targets this exact URL (e.g., `https://riemann.victoryinitiative.com/mcp`).
2. `VERCEL_URL`: If running in a Vercel-like environment, targets the canonical host.
3. **Localhost Fallbacks**: Checks `http://127.0.0.1:7000/mcp` and `http://127.0.0.1:3000/mcp`.

### Environment Variables
To configure the bridge, you can define these environment variables in your agent's MCP config:
- `MCP_BRIDGE_URL`: (Optional) Force the bridge to talk to a deployed environment.
- `MCP_BRIDGE_LOCAL_PORT`: (Optional) Defaults to `7000`. Useful if your dev server runs on a custom port.
- `MCP_BRIDGE_TIMEOUT_MS`: (Optional) Request timeout. Defaults to `30000` (30 seconds).
- `RESEARCH_RUN_TOKEN`: (Required for mutable actions). Bearer token passed in the `Authorization` header.

### Local-filesystem fallback (read-only tools)
When no HTTP endpoint is reachable (e.g., the dev server is not running), the bridge serves read-only tools — `get_manifest`, `get_theorem_candidate`, `get_obligations`, `get_obligation`, `get_open_gaps`, `get_implementation_health`, `get_history`, `get_experiment` — directly from `public/experiments.json` and `public/verdict_history.jsonl`. Responses are wrapped in a `tools/call` content envelope and prefixed with a banner indicating the fallback path. HTTP-only tools (`get_series`, `compare_scales`, `compare_runs`, `compare_verdicts`, `start_run`, `start_custom_run`, `cancel_run`, `resume_run`, `get_run_status`, `get_run_logs`, `get_run_events`) still require the live HTTP server; when unreachable, they emit a visible `isError` result explaining the requirement instead of failing silently.

---

## 4. Exposed Tool Surface

The tools exposed to the agent are defined in `app/mcp/route.ts`. They provide read access to the research state and guarded write access to run execution.

### Experiment Identity
Internal result keys remain stable (`EXP_1`, `EXP_1B`, etc.), but user-facing labels now use display IDs and aliases. The manifest exposes both:
- `experiments`: display metadata for every stable experiment key.
- `experiment_aliases`: a lookup map from display IDs and aliases back to stable IDs.

Examples:
- `CORE-1` / `harmonic-converter` -> `EXP_1`
- `CTRL-1` -> `EXP_1B`
- `VAL-1` -> `EXP_6`
- `DEMO-1` -> `EXP_9`

Tools that accept an experiment identifier should accept either the stable ID or a display alias.

### Metadata & State
- **`get_manifest`**: Retrieve the project manifest, display experiment metadata, aliases, and a summary of the canonical ontology.
- **`get_implementation_health`**: Get health statuses for non-theoretic pipeline stages.
- **`get_history`**: Get a list of canonical history entries. (Input: `limit` optional).

### Theorems & Proofs
- **`get_theorem_candidate`**: Retrieve the candidate theorem statement along with its non-claims.
- **`get_obligations`**: List all current proof obligations and their verification statuses.
- **`get_obligation`**: Get granular details for a single obligation by its `id`.
- **`get_open_gaps`**: List all currently open proof gaps that require resolution.

### Experimentation Data
- **`get_experiment`**: Fetch the canonical verdict payload for a specific experiment by stable ID or display alias.
- **`get_series`**: Retrieve a downsampled experiment series for graphing or trend analysis. (Inputs: `id`, `variant`, `k`, `base`, `fields`, `downsample`; `id` accepts stable IDs or display aliases).
- **`compare_scales`**: Compare numeric summaries for an experiment across different values of `k`; `experiment` accepts stable IDs or display aliases.
- **`compare_runs`**: Compare canonical deltas between two specific run timestamps (`runA`, `runB`).
- **`compare_verdicts`**: Compare verdict delta maps between two run timestamps.

### Run Management (Authentication Required)
- **`start_run`**: Trigger a new canonical pipeline run. (Input: `mode` enum: `verify`, `smoke`, `standard`, `authoritative`, `overkill`).
- **`start_custom_run`**: Trigger a custom selected-experiment run through the unified research run manager.
- **`get_run_status`**: Get the status of an ongoing run by `run_id`.
- **`get_run_logs`**: Incrementally fetch logs for a specific run from an offset.
- **`get_run_events`**: Incrementally fetch structured run events for a specific run from an offset.
- **`cancel_run`**: Request cancellation for an active run.
- **`resume_run`**: Resume a canonical run from a compatible checkpoint.

---

## 5. Security & Authentication

Read operations on the research domain (like fetching theorems or experiment results) are generally unprotected at the MCP layer so agents can freely explore the state.

However, state-mutating or live run-management tools—`start_run`, `start_custom_run`, `get_run_status`, `get_run_logs`, `get_run_events`, `cancel_run`, and `resume_run`—require authorization.

The `app/mcp/route.ts` enforces this via the `assertRunAuth` function. If the `RESEARCH_RUN_TOKEN` environment variable is not provided to the bridge script, or if the token is invalid, the Next.js API will reject the JSON-RPC request with a `-32001 Unauthorized` error.

---

## 6. Usage & Configuration Examples

To give an AI agent access to the `riemann_converter` MCP, you must configure it to execute the bridge script.

### Claude Desktop Configuration
Add the following to your Claude Desktop config file (usually located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "riemann-research": {
      "command": "node",
      "args": [
        "c:/Development/Projects/riemann_converter/mcp-bridge.mjs"
      ],
      "env": {
        "MCP_BRIDGE_LOCAL_PORT": "7000",
        "RESEARCH_RUN_TOKEN": "your-secret-token-here"
      }
    }
  }
}
```

### Remote/Deployed Environments
If you want your local agent to debug the production Vercel deployment rather than your local dev server, update the environment block:

```json
      "env": {
        "MCP_BRIDGE_URL": "https://riemann.victoryinitiative.com",
        "RESEARCH_RUN_TOKEN": "your-production-secret"
      }
```

This setup empowers your local agent to query the live state of the research project, compare experiment verdicts, and even trigger authoritative runs seamlessly.
