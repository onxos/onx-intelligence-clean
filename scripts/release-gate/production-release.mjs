// VENDORED from onxos/onx scripts/platform-release-gate/production-release.mjs @ 33d33c7dbb51f5fae33c035464ec03469a13cca5
// Do not edit here — change the source in onxos/onx and re-vendor.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const PLATFORM_TARGET = Object.freeze({
  serviceId: "srv-d96tb3d8nd3s73bm3ctg",
  name: "onx-platform",
  repository: "onxos/onx",
  branch: "main",
  rootDir: "apps/platform",
  preDeployCommand: "npm run db:sync",
  healthPath: "/api/health",
});

const TERMINAL_FAILURES = new Set([
  "build_failed",
  "canceled",
  "deactivated",
  "pre_deploy_failed",
  "update_failed",
]);
const SHA_RE = /^[0-9a-f]{40}$/;

export class PlatformProductionReleaseError extends Error {
  constructor(code, message, report) {
    super(message);
    this.name = "PlatformProductionReleaseError";
    this.code = code;
    this.report = report;
  }
}

function fail(code, message, report) {
  throw new PlatformProductionReleaseError(code, message, report);
}

function unwrap(value, key) {
  return value && typeof value === "object" ? value[key] ?? value : value;
}

function normalizeRepository(value) {
  return String(value ?? "")
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

function deployCommit(deploy) {
  return typeof deploy?.commit === "string"
    ? deploy.commit
    : deploy?.commit?.id;
}

function safeFailure(error) {
  return {
    code:
      error instanceof PlatformProductionReleaseError
        ? error.code
        : "UNEXPECTED_ERROR",
    message: (error instanceof Error ? error.message : String(error))
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .slice(0, 240),
  };
}

function serviceUrl(service) {
  return service?.url ?? service?.serviceDetails?.url ?? null;
}

function validateService(service, report, releaseTarget) {
  const details = service?.serviceDetails ?? {};
  const env = details.envSpecificDetails ?? {};
  const defects = [];
  if (service?.id !== releaseTarget.serviceId) defects.push("SERVICE_ID");
  if (service?.name !== releaseTarget.name) defects.push("SERVICE_NAME");
  if (normalizeRepository(service?.repo) !== releaseTarget.repository) {
    defects.push("REPOSITORY");
  }
  if ((service?.branch ?? details.branch) !== releaseTarget.branch) {
    defects.push("BRANCH");
  }
  if (service?.rootDir !== releaseTarget.rootDir) defects.push("ROOT_DIR");
  // releaseTarget.preDeployCommand === null means "the service must have none".
  if ((env.preDeployCommand ?? null) !== (releaseTarget.preDeployCommand ?? null)) {
    defects.push("PREDEPLOY_COMMAND");
  }
  if (service?.autoDeploy !== "no") defects.push("AUTODEPLOY_HOLD");
  // A background worker has no public URL; healthExpect "none" waives it.
  if (
    releaseTarget.healthExpect !== "none" &&
    !/^https:\/\//.test(String(serviceUrl(service) ?? ""))
  ) {
    defects.push("SERVICE_URL");
  }
  if (defects.length) {
    fail(
      "SERVICE_IDENTITY_OR_HOLD_MISMATCH",
      `service rejected: ${defects.join(",")}`,
      report,
    );
  }
}

export async function executePlatformProductionRelease({
  fetchImpl = globalThis.fetch,
  renderApiKey,
  targetSha,
  rollbackSha,
  ciProofSha,
  actor,
  runId,
  writeLease,
  renderApiBase = "https://api.render.com/v1",
  now = () => Date.now(),
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  deployPollIntervalMs = 15_000,
  maxDeployPolls = 100,
  monitorSamples = 30,
  monitorIntervalMs = 30_000,
  releaseTarget = PLATFORM_TARGET,
} = {}) {
  const target = String(targetSha ?? "").toLowerCase();
  const rollback = String(rollbackSha ?? "").toLowerCase();
  const report = {
    acceptance: "FAIL",
    action: "ONX_PLATFORM_CANONICAL_PRODUCTION_RELEASE",
    serviceId: releaseTarget.serviceId,
    targetSha: target,
    rollbackSha: rollback,
    actor: actor ?? null,
    releaseRunId: String(runId ?? ""),
    leaseState: "NOT_ACQUIRED",
    renderMutations: [],
    renderMutationCount: 0,
    healthSamples: [],
    startedAt: new Date(now()).toISOString(),
  };
  let lease = null;

  if (typeof fetchImpl !== "function") {
    fail("FETCH_UNAVAILABLE", "fetch is unavailable", report);
  }
  if (!renderApiKey) {
    fail("RENDER_API_KEY_MISSING", "RENDER_API_KEY is required", report);
  }
  if (!SHA_RE.test(target) || !SHA_RE.test(rollback)) {
    fail("INVALID_SHA", "target and rollback must be exact 40-hex SHAs", report);
  }
  if (target === rollback) {
    fail("TARGET_EQUALS_ROLLBACK", "target must differ from rollback", report);
  }
  if (String(ciProofSha ?? "").toLowerCase() !== target) {
    fail("CI_PROOF_SHA_MISMATCH", "CI proof must bind to target SHA", report);
  }
  if (!actor || !String(runId ?? "")) {
    fail("RELEASE_IDENTITY_MISSING", "actor and run id are required", report);
  }
  if (typeof writeLease !== "function") {
    fail("LEASE_WRITER_MISSING", "durable lease writer is required", report);
  }

  const renderHeaders = {
    Accept: "application/json",
    Authorization: `Bearer ${renderApiKey}`,
  };
  async function callJson(method, url, body, renderAuth = true) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        ...(renderAuth ? renderHeaders : { Accept: "application/json" }),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(!renderAuth ? { "Cache-Control": "no-cache" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45_000),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload };
  }

  async function readService() {
    const result = await callJson(
      "GET",
      `${renderApiBase}/services/${releaseTarget.serviceId}`,
    );
    if (!result.ok) {
      fail(
        "SERVICE_GET_FAILED",
        `service GET failed: HTTP ${result.status}`,
        report,
      );
    }
    const service = unwrap(result.payload, "service");
    validateService(service, report, releaseTarget);
    return service;
  }

  async function readDeploys() {
    const result = await callJson(
      "GET",
      `${renderApiBase}/services/${releaseTarget.serviceId}/deploys?limit=100`,
    );
    if (!result.ok || !Array.isArray(result.payload)) {
      fail(
        "DEPLOYS_GET_FAILED",
        `deploy list failed: HTTP ${result.status}`,
        report,
      );
    }
    return result.payload.map((row) => unwrap(row, "deploy"));
  }

  async function createDeploy(commitId, action) {
    const result = await callJson(
      "POST",
      `${renderApiBase}/services/${releaseTarget.serviceId}/deploys`,
      { commitId, clearCache: "do_not_clear" },
    );
    report.renderMutations.push({
      method: "POST",
      serviceId: releaseTarget.serviceId,
      action,
      commitId,
      httpStatus: result.status,
    });
    report.renderMutationCount = report.renderMutations.length;
    if (!result.ok) {
      fail(
        "DEPLOY_CREATE_FAILED",
        `${action} failed: HTTP ${result.status}`,
        report,
      );
    }
    const deploy = unwrap(result.payload, "deploy");
    if (!deploy?.id) {
      fail("DEPLOY_ID_MISSING", "Render returned no deploy id", report);
    }
    return deploy.id;
  }

  async function waitForLive(deployId, expectedSha, phase) {
    for (let attempt = 1; attempt <= maxDeployPolls; attempt += 1) {
      const deploys = await readDeploys();
      const current = deploys.find((deploy) => deploy?.id === deployId);
      if (!current) {
        fail("DEPLOY_DISAPPEARED", `${phase} deploy disappeared`, report);
      }
      const commit = String(deployCommit(current) ?? "").toLowerCase();
      if (commit && commit !== expectedSha) {
        fail("DEPLOY_SHA_MISMATCH", `${phase} deploy SHA mismatch`, report);
      }
      if (TERMINAL_FAILURES.has(current.status)) {
        fail(
          "DEPLOY_TERMINAL_FAILURE",
          `${phase} deploy entered ${current.status}`,
          report,
        );
      }
      if (current.status === "live") return current;
      if (attempt === maxDeployPolls) {
        fail("DEPLOY_TIMEOUT", `${phase} deploy timed out`, report);
      }
      await sleep(deployPollIntervalMs);
    }
  }

  async function checkHealth(url) {
    if (releaseTarget.healthExpect === "none") {
      return { status: "skipped", checkedAt: new Date(now()).toISOString() };
    }
    const result = await callJson(
      "GET",
      `${url}${releaseTarget.healthPath}`,
      null,
      false,
    );
    const health = result.payload;
    const healthy =
      releaseTarget.healthExpect === "http-200"
        ? result.ok
        : result.ok && health?.status === "ok" && health?.db === "connected";
    if (!healthy) {
      fail(
        "LIVE_HEALTH_OR_DATABASE_FAILED",
        `live health failed: HTTP ${result.status}`,
        report,
      );
    }
    return {
      status: health?.status ?? (result.ok ? "http-200" : "unhealthy"),
      db: health?.db ?? null,
      version: health?.version ?? null,
      timestamp: health?.timestamp ?? null,
      checkedAt: new Date(now()).toISOString(),
    };
  }

  async function persist(next) {
    await writeLease(next);
    lease = next;
    report.leaseState = next.state;
  }

  try {
    const service = await readService();
    const deploys = await readDeploys();
    const currentLive = deploys.find((deploy) => deploy?.status === "live");
    const currentLiveSha = String(
      deployCommit(currentLive) ?? "",
    ).toLowerCase();
    if (currentLiveSha !== rollback) {
      fail(
        "ROLLBACK_SHA_NOT_CURRENTLY_LIVE",
        "pinned rollback SHA is not the current live SHA",
        report,
      );
    }

    const acquiredAt = new Date(now()).toISOString();
    lease = {
      schemaVersion: 1,
      leaseId: `platform-release-${runId}`,
      state: "ARMED",
      serviceId: releaseTarget.serviceId,
      owner: actor,
      releaseRunId: String(runId),
      startedAt: acquiredAt,
      acquiredAt,
      expiresAt: new Date(now() + 60 * 60 * 1000).toISOString(),
      prechangeCommitSha: rollback,
      targetCommitSha: target,
      prechangeDeployId: currentLive?.id ?? null,
    };
    await persist(lease);

    const deployId = await createDeploy(target, "DEPLOY_EXACT_MERGE_SHA");
    lease = { ...lease, deployId };
    await persist(lease);
    const live = await waitForLive(deployId, target, "release");
    report.deployId = deployId;
    report.preDeploy = "PASS_BY_LIVE_DEPLOY";
    report.liveCommitSha = String(deployCommit(live) ?? "").toLowerCase();

    for (let sample = 1; sample <= monitorSamples; sample += 1) {
      const currentService = await readService();
      const currentDeploys = await readDeploys();
      const current = currentDeploys.find(
        (deploy) => deploy?.status === "live",
      );
      if (
        current?.id !== deployId ||
        String(deployCommit(current) ?? "").toLowerCase() !== target
      ) {
        fail(
          "LIVE_DEPLOY_CHANGED_DURING_MONITOR",
          "live deploy changed during the 15-minute monitor",
          report,
        );
      }
      report.healthSamples.push(
        await checkHealth(serviceUrl(currentService)),
      );
      if (sample < monitorSamples) await sleep(monitorIntervalMs);
    }

    const releasedAt = new Date(now()).toISOString();
    lease = {
      ...lease,
      state: "RELEASED",
      releasedAt,
      deployId,
      releaseRunId: String(runId),
      liveCommitSha: target,
      monitorSamples,
      monitorMinutes: 15,
    };
    await persist(lease);
    report.acceptance = "PASS";
    report.leaseState = "RELEASED";
    report.releasedAt = releasedAt;
    report.completedAt = releasedAt;
    return report;
  } catch (error) {
    report.failure = safeFailure(error);
    if (lease?.state === "ARMED") {
      try {
        const rollbackDeployId = await createDeploy(
          rollback,
          "ROLLBACK_EXACT_PINNED_SHA",
        );
        const live = await waitForLive(
          rollbackDeployId,
          rollback,
          "rollback",
        );
        lease = {
          ...lease,
          state: "ROLLED_BACK",
          rolledBackAt: new Date(now()).toISOString(),
          rollbackDeployId,
          rollbackFinalStatus: live.status,
          releaseRunId: String(runId),
        };
        await persist(lease);
        report.rollback = {
          acceptance: "PASS",
          rollbackDeployId,
          liveCommitSha: rollback,
        };
      } catch (rollbackError) {
        report.rollback = {
          acceptance: "FAIL",
          failure: safeFailure(rollbackError),
        };
      }
    }
    report.completedAt = new Date(now()).toISOString();
    if (error instanceof PlatformProductionReleaseError) {
      error.report = report;
      throw error;
    }
    throw new PlatformProductionReleaseError(
      "UNEXPECTED_ERROR",
      report.failure.message,
      report,
    );
  }
}

async function writeControlLease(lease) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const ref = process.env.PLATFORM_RELEASE_CONTROL_REF ?? "onx-ops-control";
  const path =
    process.env.PLATFORM_RELEASE_CONTROL_PATH ??
    "leases/platform-release-current.json";
  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
  }
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(ref)}`, {
    headers,
    signal: AbortSignal.timeout(45_000),
  });
  let sha;
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) {
    throw new Error(`lease read failed: HTTP ${existing.status}`);
  }
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `ops(platform): lease ${lease.leaseId} ${lease.state}`,
      content: Buffer.from(`${JSON.stringify(lease, null, 2)}\n`).toString(
        "base64",
      ),
      branch: ref,
      ...(sha ? { sha } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`lease write failed: HTTP ${response.status}`);
  }
}

async function persistReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const reportPath =
    process.env.REPORT_PATH ??
    "docs/runtime-attestations/onx-platform-production-release.json";
  try {
    let releaseTarget;
    if (process.env.RELEASE_TARGET_JSON) {
      releaseTarget = Object.freeze(JSON.parse(process.env.RELEASE_TARGET_JSON));
      for (const key of ["serviceId", "name", "repository", "branch", "rootDir"]) {
        if (!releaseTarget[key]) throw new Error(`RELEASE_TARGET_JSON missing ${key}`);
      }
      if (releaseTarget.healthExpect !== "none" && !releaseTarget.healthPath) {
        throw new Error("RELEASE_TARGET_JSON missing healthPath");
      }
    }
    const report = await executePlatformProductionRelease({
      ...(releaseTarget ? { releaseTarget } : {}),
      renderApiKey: process.env.RENDER_API_KEY,
      targetSha: process.env.TARGET_SHA,
      rollbackSha: process.env.ROLLBACK_SHA,
      ciProofSha: process.env.CI_PROOF_SHA,
      actor: process.env.GITHUB_ACTOR,
      runId: process.env.GITHUB_RUN_ID,
      writeLease: writeControlLease,
    });
    await persistReport(reportPath, report);
    process.stdout.write("ONX_PLATFORM_PRODUCTION_RELEASE=PASS\n");
  } catch (error) {
    const report =
      error instanceof PlatformProductionReleaseError && error.report
        ? error.report
        : {
            acceptance: "FAIL",
            failure: safeFailure(error),
            renderMutationCount: 0,
          };
    await persistReport(reportPath, report);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
