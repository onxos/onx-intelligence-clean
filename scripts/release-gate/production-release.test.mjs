// VENDORED from onxos/onx scripts/platform-release-gate/production-release.test.mjs @ 33d33c7dbb51f5fae33c035464ec03469a13cca5
// Do not edit here — change the source in onxos/onx and re-vendor.
import assert from "node:assert/strict";
import test from "node:test";
import {
  executePlatformProductionRelease,
  PLATFORM_TARGET,
} from "./production-release.mjs";

const TARGET = "b".repeat(40);
const ROLLBACK = "a".repeat(40);
const NOW = Date.parse("2026-07-28T12:00:00Z");

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function fakeRender({
  autoDeploy = "no",
  rootDir = "apps/platform",
  preDeployCommand = "npm run db:sync",
  healthOk = true,
  targetStatus = "live",
} = {}) {
  const calls = [];
  let deploys = [
    {
      id: "dep-prechange",
      status: "live",
      commit: { id: ROLLBACK },
    },
  ];
  const service = {
    id: PLATFORM_TARGET.serviceId,
    name: PLATFORM_TARGET.name,
    repo: "https://github.com/onxos/onx",
    branch: "main",
    rootDir,
    autoDeploy,
    url: "https://platform.example",
    serviceDetails: {
      envSpecificDetails: { preDeployCommand },
    },
  };
  const base = `https://api.render.com/v1/services/${PLATFORM_TARGET.serviceId}`;
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, url, body });
    if (url === base && method === "GET") {
      return response({ service });
    }
    if (url === `${base}/deploys?limit=100` && method === "GET") {
      return response(deploys.map((deploy) => ({ deploy })));
    }
    if (url === `${base}/deploys` && method === "POST") {
      deploys = deploys.map((deploy) => ({ ...deploy, status: "deactivated" }));
      const commit = body.commitId;
      const deploy = {
        id: commit === TARGET ? "dep-target" : "dep-rollback",
        status: commit === TARGET ? targetStatus : "live",
        commit: { id: commit },
      };
      deploys.unshift(deploy);
      return response({ deploy }, 201);
    }
    if (url === "https://platform.example/api/health" && method === "GET") {
      return healthOk
        ? response({
            status: "ok",
            db: "connected",
            version: "V8.0.0",
            timestamp: "2026-07-28T12:00:00Z",
          })
        : response({ status: "error", db: "unreachable" }, 503);
    }
    return response({}, 404);
  };
  return { fetchImpl, calls, deploys };
}

function writes(calls) {
  return calls.filter((call) =>
    ["POST", "PATCH", "PUT", "DELETE"].includes(call.method),
  );
}

function execute(fake, overrides = {}) {
  const leases = [];
  return {
    leases,
    promise: executePlatformProductionRelease({
      fetchImpl: fake.fetchImpl,
      renderApiKey: "render-test-key",
      targetSha: TARGET,
      rollbackSha: ROLLBACK,
      ciProofSha: TARGET,
      actor: "onxos",
      runId: "12345",
      writeLease: async (lease) => leases.push(structuredClone(lease)),
      now: () => NOW,
      sleep: async () => {},
      deployPollIntervalMs: 0,
      maxDeployPolls: 2,
      monitorSamples: 2,
      monitorIntervalMs: 0,
      ...overrides,
    }),
  };
}

test("arms before deploy, monitors DB-backed health, then releases", async () => {
  const fake = fakeRender();
  const run = execute(fake);
  const report = await run.promise;
  assert.equal(report.acceptance, "PASS");
  assert.equal(report.leaseState, "RELEASED");
  assert.equal(report.deployId, "dep-target");
  assert.equal(report.healthSamples.length, 2);
  assert.deepEqual(run.leases.map((lease) => lease.state), [
    "ARMED",
    "ARMED",
    "RELEASED",
  ]);
  assert.equal(run.leases[0].owner, "onxos");
  assert.equal(run.leases[0].releaseRunId, "12345");
  assert.equal(writes(fake.calls).length, 1);
  assert.equal(writes(fake.calls)[0].body.commitId, TARGET);
});

test("failed health rolls back to the exact pinned SHA", async () => {
  const fake = fakeRender({ healthOk: false });
  const run = execute(fake);
  await assert.rejects(
    run.promise,
    (error) => error.code === "LIVE_HEALTH_OR_DATABASE_FAILED",
  );
  assert.equal(run.leases.at(-1).state, "ROLLED_BACK");
  assert.equal(run.leases.at(-1).rollbackDeployId, "dep-rollback");
  assert.deepEqual(
    writes(fake.calls).map((call) => call.body.commitId),
    [TARGET, ROLLBACK],
  );
});

for (const [name, options] of [
  ["autoDeploy", { autoDeploy: "yes" }],
  ["rootDir", { rootDir: "apps/intelligence" }],
  ["preDeploy", { preDeployCommand: "npm run db:push" }],
]) {
  test(`${name} mismatch fails before lease or Render mutation`, async () => {
    const fake = fakeRender(options);
    const run = execute(fake);
    await assert.rejects(
      run.promise,
      (error) => error.code === "SERVICE_IDENTITY_OR_HOLD_MISMATCH",
    );
    assert.equal(run.leases.length, 0);
    assert.equal(writes(fake.calls).length, 0);
  });
}

test("stale rollback SHA fails before lease or mutation", async () => {
  const fake = fakeRender();
  const run = execute(fake, { rollbackSha: "c".repeat(40) });
  await assert.rejects(
    run.promise,
    (error) => error.code === "ROLLBACK_SHA_NOT_CURRENTLY_LIVE",
  );
  assert.equal(run.leases.length, 0);
  assert.equal(writes(fake.calls).length, 0);
});

test("CI proof must bind to the exact merge SHA before network", async () => {
  const fake = fakeRender();
  const run = execute(fake, { ciProofSha: "c".repeat(40) });
  await assert.rejects(
    run.promise,
    (error) => error.code === "CI_PROOF_SHA_MISMATCH",
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(run.leases.length, 0);
});

test("terminal target deploy failure triggers exact rollback", async () => {
  const fake = fakeRender({ targetStatus: "build_failed" });
  const run = execute(fake);
  await assert.rejects(
    run.promise,
    (error) => error.code === "DEPLOY_TERMINAL_FAILURE",
  );
  assert.equal(run.leases.at(-1).state, "ROLLED_BACK");
  assert.deepEqual(
    writes(fake.calls).map((call) => call.body.commitId),
    [TARGET, ROLLBACK],
  );
});

// ---------------------------------------------------------------------------
// Generalized releaseTarget injection (ONX-FRR-2026-001 deploy unification)
// ---------------------------------------------------------------------------

const WORKER_TARGET = Object.freeze({
  serviceId: "srv-worker0000000000000000",
  name: "onx-video-worker",
  repository: "onxos/onx-marketing-platform",
  branch: "main",
  rootDir: "apps/api",
  preDeployCommand: null,
  healthPath: null,
  healthExpect: "none",
});

function fakeWorkerRender({ autoDeploy = "no" } = {}) {
  const calls = [];
  let deploys = [
    { id: "dep-live", status: "live", commit: { id: ROLLBACK } },
  ];
  const service = {
    id: WORKER_TARGET.serviceId,
    name: WORKER_TARGET.name,
    repo: `https://github.com/${WORKER_TARGET.repository}`,
    branch: WORKER_TARGET.branch,
    rootDir: WORKER_TARGET.rootDir,
    autoDeploy,
    // Background workers expose no public URL and no preDeployCommand.
    serviceDetails: { envSpecificDetails: {} },
  };
  const base = `https://api.render.com/v1/services/${WORKER_TARGET.serviceId}`;
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, url, body });
    if (url === base && method === "GET") return response({ service });
    if (url === `${base}/deploys?limit=100` && method === "GET") {
      return response(deploys.map((deploy) => ({ deploy })));
    }
    if (url === `${base}/deploys` && method === "POST") {
      deploys = deploys.map((deploy) => ({ ...deploy, status: "deactivated" }));
      const deploy = {
        id: body.commitId === TARGET ? "dep-target" : "dep-rollback",
        status: "live",
        commit: { id: body.commitId },
      };
      deploys.unshift(deploy);
      return response({ deploy }, 201);
    }
    return response({}, 404);
  };
  return { fetchImpl, calls, deploys };
}

test("injected worker target releases with no URL, no health, no preDeploy", async () => {
  const fake = fakeWorkerRender();
  const run = execute(fake, { releaseTarget: WORKER_TARGET });
  const report = await run.promise;
  assert.equal(report.acceptance, "PASS");
  assert.equal(report.serviceId, WORKER_TARGET.serviceId);
  assert.equal(report.healthSamples.every((s) => s.status === "skipped"), true);
  assert.equal(writes(fake.calls).length, 1);
  assert.equal(run.leases.at(-1).state, "RELEASED");
});

test("injected target still fail-closes when autoDeploy is not held", async () => {
  const fake = fakeWorkerRender({ autoDeploy: "yes" });
  const run = execute(fake, { releaseTarget: WORKER_TARGET });
  await assert.rejects(run.promise, (error) => {
    assert.equal(error.code, "SERVICE_IDENTITY_OR_HOLD_MISMATCH");
    assert.match(error.message, /AUTODEPLOY_HOLD/);
    return true;
  });
  assert.equal(writes(fake.calls).length, 0);
  assert.equal(run.leases.length, 0);
});

test("http-200 health mode accepts a bare 200 body", async () => {
  const fake = fakeRender({ healthOk: false });
  // Same platform service, but only require HTTP 200 from a custom path.
  const run = execute(fake, {
    releaseTarget: Object.freeze({
      ...PLATFORM_TARGET,
      healthPath: "/api/health",
      healthExpect: "http-200",
    }),
  });
  await assert.rejects(run.promise, (error) => {
    // healthOk:false serves HTTP 503 -> even http-200 mode must roll back.
    assert.equal(error.code, "LIVE_HEALTH_OR_DATABASE_FAILED");
    return true;
  });
  const rollback = fake.calls.filter(
    (call) => call.method === "POST" && call.body?.commitId === ROLLBACK,
  );
  assert.equal(rollback.length, 1);
});
