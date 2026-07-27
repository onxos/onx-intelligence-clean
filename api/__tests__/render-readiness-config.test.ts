import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const renderYamlPath = fileURLToPath(
  new URL("../../render.yaml", import.meta.url)
);

function serviceBlock(name: string): string {
  const yaml = readFileSync(renderYamlPath, "utf8");
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = yaml.match(
    new RegExp(
      String.raw`^  - type: web\n    name: ${escapedName}\n([\s\S]*?)(?=^  - type: |(?![\s\S]))`,
      "m"
    )
  );

  if (!match) {
    throw new Error(`Render web service not found: ${name}`);
  }

  return match[0];
}

describe("Render database-backed readiness guard", () => {
  for (const serviceName of [
    "onx-intelligence-clean",
    "onx-intelligence-staging",
  ]) {
    it(`${serviceName} uses health.dbReady instead of process liveness`, () => {
      const block = serviceBlock(serviceName);

      expect(block).toContain("healthCheckPath: /api/trpc/health.dbReady");
      expect(block).not.toContain("healthCheckPath: /api/trpc/health.ping");
    });
  }
});
