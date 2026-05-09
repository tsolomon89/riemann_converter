const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  // Skip helper scripts that live alongside tests but are not themselves tests
  // (e.g. the long-lived Node ESM loader for mcp-bridge.mjs). Tests that need
  // them spawn them as child processes.
  testPathIgnorePatterns: ["/node_modules/", "/__tests__/_helpers/"],
};