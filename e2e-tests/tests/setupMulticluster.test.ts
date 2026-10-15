/*
 * Copyright 2026 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { isMap, parseAllDocuments } from "yaml";

const setupScript = readFileSync(
  new URL("../scripts/setup-multicluster.sh", import.meta.url),
  "utf8",
);
const waitFunction = setupScript.slice(
  setupScript.indexOf("wait_for_inventory() {"),
  setupScript.indexOf("write_playwright_env() {"),
);
const discovered = JSON.stringify({
  clusters: [{ meta_data: { source: "cluster_inventory" } }],
});

function waitForInventory(responses: { body: string; status: number }[]) {
  const cases = responses
    .map(
      ({ body, status }, index) =>
        `${index}) printf '%s' '${body.replaceAll("'", "'\\''")}'; return ${status} ;;`,
    )
    .join("\n");

  return spawnSync(
    "bash",
    [
      "-c",
      `
      set -euo pipefail
      ${waitFunction}
      curl() {
        case "$attempt" in
          ${cases}
          *) return 7 ;;
        esac
      }
      # Emulate jq 1.6 returning success on empty input.
      jq() {
        local input
        input="$(cat)"
        if [[ -z "$input" ]]; then return 0; fi
        command jq "$@" <<<"$input"
      }
      sleep() { printf 'RETRY\\n' >&2; }
      wait_for_inventory http://headlamp.test
      printf 'READY\\n'
    `,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
}

describe("multi-cluster readiness", () => {
  test.each([
    { name: "connection failure", body: "", status: 7 },
    { name: "failed request with a body", body: discovered, status: 22 },
    { name: "empty response", body: "", status: 0 },
    { name: "invalid JSON", body: "<html>unavailable</html>", status: 0 },
    { name: "no discovered cluster", body: '{"clusters":[]}', status: 0 },
    {
      name: "multiple discovered clusters",
      body: JSON.stringify({
        clusters: [
          { meta_data: { source: "cluster_inventory" } },
          { meta_data: { source: "cluster_inventory" } },
        ],
      }),
      status: 0,
    },
  ])("retries $name before reporting readiness", ({ body, status }) => {
    const result = waitForInventory([
      { body, status },
      { body: discovered, status: 0 },
    ]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("READY\n");
    expect(result.stderr.match(/RETRY/g)).toHaveLength(1);
  });

  test("fails after 120 unsuccessful attempts without reporting readiness", () => {
    const result = waitForInventory([]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("READY");
    expect(result.stderr.match(/RETRY/g)).toHaveLength(120);
    expect(result.stderr).toContain(
      "timed out waiting for a discovered ClusterProfile",
    );
  });

  test("deployment readiness checks the HTTP config endpoint", () => {
    const manifest = readFileSync(
      new URL("../kubernetes-headlamp-ci.yaml", import.meta.url),
      "utf8",
    );
    const deployment = parseAllDocuments(manifest).find(
      (doc) => doc.get("kind") === "Deployment",
    );

    const probe = deployment?.getIn([
      "spec",
      "template",
      "spec",
      "containers",
      0,
      "readinessProbe",
      "httpGet",
    ]);

    if (!isMap(probe)) {
      throw new Error("Headlamp deployment must have an HTTP readiness probe");
    }

    expect(probe.toJSON()).toEqual({ path: "/config", port: "http" });
  });
});
