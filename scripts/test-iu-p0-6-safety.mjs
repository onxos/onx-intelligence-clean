#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const opsPath = new URL("./onx-pg-ops.mjs", import.meta.url);
const workflowPath = new URL("../.github/workflows/iu-p0-6-pg-backup.yml", import.meta.url);
const ops = readFileSync(opsPath, "utf8");
const workflow = readFileSync(workflowPath, "utf8");

function replaceAfter(source, anchor, target, replacement) {
  const anchorIndex = source.indexOf(anchor);
  assert.notEqual(anchorIndex, -1, `missing mutation anchor: ${anchor}`);
  const targetIndex = source.indexOf(target, anchorIndex);
  assert.notEqual(targetIndex, -1, `missing mutation target: ${target}`);
  return source.slice(0, targetIndex) + replacement + source.slice(targetIndex + target.length);
}

function violations(source, flow) {
  const found = [];
  const require = (condition, name) => {
    if (!condition) found.push(name);
  };

  require(source.includes("pg_export_snapshot()"), "snapshot is exported");
  require(source.includes("ONX_SELF_CHECK"), "runtime emits source provenance");
  require(source.includes("`--snapshot=${snapshotId}`"), "pg_dump consumes exported snapshot");
  require(
    source.includes("fingerprint(psql, t.url, snapshotId)"),
    "manifest fingerprint consumes exported snapshot",
  );
  require(
    source.includes('o.Key?.includes("/_restore-drills/")'),
    "restore-drill evidence is exempt from retention deletion",
  );
  require(
    source.includes('if (!expectIsolated) fail("ONX_RESTORE_TARGET_DB_ID not set")'),
    "restore requires an isolated resource id",
  );
  require(
    source.includes('isolatedName.startsWith("onx-restore-test-")'),
    "restore requires isolated resource name",
  );
  require(
    source.includes('isolatedDatabaseName !== "onx_restore_test"'),
    "restore requires isolated database name",
  );
  require(
    source.includes("isolated restore target is not empty"),
    "restore refuses a non-empty target",
  );
  require(
    !source.includes("parallel restore reported errors, retrying single-threaded"),
    "failed restore is never replayed into a partially restored target",
  );
  require(
    source.includes('"--exit-on-error", "--jobs=2"'),
    "restore fails on its first SQL/object error",
  );
  require(
    flow.includes('test_name.startswith("onx-restore-test-")'),
    "workflow validates reused resource name",
  );
  require(
    flow.includes('test_database_name != "onx_restore_test"'),
    "workflow validates reused database name",
  );
  require(
    flow.includes('"ONX_RESTORE_TARGET_NAME": test_name'),
    "workflow passes isolation evidence to runtime",
  );
  require(
    !flow.includes('"ONX_OP": "restore-verify"'),
    "workflow never persists restore mode on the scheduled cron",
  );
  require(
    flow.includes('"ONX_OP=restore-verify node scripts/onx-pg-ops.mjs"'),
    "restore mode is scoped to the isolated one-off job command",
  );
  require(
    flow.includes("group: iu-p0-6-${{ inputs.cron_id || 'frankfurt-default' }}"),
    "workflow serializes operations per Render cron",
  );
  require(
    flow.includes("cancel-in-progress: false"),
    "workflow never interrupts an in-flight backup or restore",
  );
  require(
    flow.includes("src_id not in (PLAT, MKTG)"),
    "workflow restricts restore source to approved databases",
  );
  require(
    flow.includes("object_src_id != src_id"),
    "workflow binds object path to requested source",
  );
  require(
    flow.includes("cron_region != src_region"),
    "workflow requires a region-matched restore cron",
  );
  require(
    flow.includes('"ONX_RESTORE_SOURCE_DB_ID": src_id'),
    "workflow passes latest-pointer source identity",
  );
  require(
    flow.includes("EXPECTED_OPS_SHA256"),
    "workflow hashes the source in its exact commit",
  );
  require(
    flow.includes("runtime source SHA"),
    "workflow rejects a stale runtime image",
  );
  require(
    flow.includes("if actual != expected:"),
    "runtime source SHA is compared to workflow source SHA",
  );
  const runModeIndex = flow.indexOf('if MODE in ("run", "restore"):');
  const runImageIndex = flow.indexOf("verify_runtime_image()", runModeIndex);
  const restoreBranchIndex = flow.indexOf('if MODE == "restore":', runModeIndex);
  require(
    runModeIndex >= 0 &&
      runImageIndex > runModeIndex &&
      restoreBranchIndex > runImageIndex,
    "runtime provenance runs before restore resource creation",
  );
  require(
    source.includes("async function runRetrieveRestoreEvidence()"),
    "runtime exposes independent restore-evidence retrieval",
  );
  require(
    source.includes("ONX_RESTORE_EVIDENCE"),
    "runtime emits a bounded restore-evidence proof",
  );
  require(
    source.includes("report.restoreTargetDbResourceId === expectedTarget"),
    "retrieved evidence binds the exact restore target",
  );
  require(
    source.includes("productionDbIds.has(expectedTarget)"),
    "runtime rejects production databases as evidence targets",
  );
  require(
    source.includes("report.sourceDbResourceId === expectedSource"),
    "retrieved evidence binds the exact source database",
  );
  require(
    source.includes("!productionDbIds.has(expectedSource)"),
    "runtime restricts evidence to approved backup sources",
  );
  require(
    source.includes("report.perTableMismatches.length === 0"),
    "retrieved evidence requires per-table equality",
  );
  require(
    flow.includes('if MODE == "retrieve":'),
    "workflow exposes an independent retrieve mode",
  );
  require(
    flow.includes("if test_id in (PLAT, MKTG, EXCL):"),
    "workflow rejects production databases as evidence targets",
  );
  const teardownIndex = flow.indexOf('if MODE == "teardown":');
  const teardownEvidenceIndex = flow.indexOf(
    "retrieve_restore_evidence(test_id, evidence_key)",
    teardownIndex,
  );
  const teardownDeleteIndex = flow.indexOf(
    'api("DELETE", "/postgres/" + test_id)',
    teardownIndex,
  );
  require(
    teardownIndex >= 0 &&
      teardownEvidenceIndex > teardownIndex &&
      teardownDeleteIndex > teardownEvidenceIndex,
    "teardown retrieves durable evidence before DELETE",
  );
  require(
    flow.includes('current.get("__error") == 404'),
    "teardown requires the resource to disappear",
  );
  require(
    flow.includes("did not disappear within 900s"),
    "teardown has a bounded absence poll",
  );
  return found;
}

assert.deepEqual(violations(ops, workflow), []);

const mutations = [
  [ops.replace("pg_export_snapshot()", "current_timestamp"), workflow, "snapshot export removed"],
  [ops.replace("ONX_SELF_CHECK", "ONX_STALE_CHECK"), workflow, "runtime provenance removed"],
  [ops.replace("`--snapshot=${snapshotId}`", '"--no-snapshot"'), workflow, "dump snapshot removed"],
  [ops.replace("fingerprint(psql, t.url, snapshotId)", "fingerprint(psql, t.url)"), workflow, "fingerprint snapshot removed"],
  [ops.replace('o.Key?.includes("/_restore-drills/")', "false"), workflow, "restore evidence retention removed"],
  [ops.replace("isolated restore target is not empty", "target contains objects"), workflow, "empty target gate removed"],
  [ops, workflow.replace('test_name.startswith("onx-restore-test-")', "True"), "workflow name gate removed"],
  [ops, workflow.replace("src_id not in (PLAT, MKTG)", "False"), "source allowlist removed"],
  [ops, workflow.replace("cron_region != src_region", "False"), "region binding removed"],
  [ops, workflow.replace("if actual != expected:", "if False:"), "runtime SHA gate removed"],
  [ops.replace("async function runRetrieveRestoreEvidence()", "async function missingRetrieve()"), workflow, "evidence retrieval removed"],
  [ops.replace("report.restoreTargetDbResourceId === expectedTarget", "true"), workflow, "target evidence binding removed"],
  [ops.replace("productionDbIds.has(expectedTarget)", "false"), workflow, "runtime production-target gate removed"],
  [ops.replace("report.sourceDbResourceId === expectedSource", "true"), workflow, "source evidence binding removed"],
  [ops.replace("!productionDbIds.has(expectedSource)", "false"), workflow, "approved evidence source gate removed"],
  [ops.replace("report.perTableMismatches.length === 0", "true"), workflow, "per-table evidence gate removed"],
  [ops, workflow.replace('if MODE == "retrieve":', 'if MODE == "never":'), "retrieve workflow mode removed"],
  [ops, workflow.replace("if test_id in (PLAT, MKTG, EXCL):", "if False:"), "workflow production-target gate removed"],
  [
    ops,
    replaceAfter(
      workflow,
      'if MODE == "teardown":',
      "retrieve_restore_evidence(test_id, evidence_key)",
      "bypass_evidence(test_id)",
    ),
    "teardown evidence call removed",
  ],
  [ops, workflow.replace('current.get("__error") == 404', "False"), "teardown absence proof removed"],
  [ops, workflow.replace("did not disappear within 900s", "teardown incomplete"), "teardown bounded failure removed"],
];

for (const [mutatedOps, mutatedWorkflow, label] of mutations) {
  assert.notDeepEqual(violations(mutatedOps, mutatedWorkflow), [], label);
}

console.log(`IU-P0-6 safety contract: PASS (${38 + mutations.length} checks)`);
