#!/usr/bin/env python3
"""Negative tests for IU-P0-6 evidence timing and optional API fields."""

from iu_p0_6_evidence_collector import (
    chronological_log_entries,
    terminal_evidence_verdict,
)


checks = 0


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(label)


# Optional or malformed log payloads are an empty observation, never a crash.
for payload in (None, [], {}, {"logs": None}, {"logs": "not-a-list"}):
    check(
        chronological_log_entries(payload) == [],
        f"optional logs payload must be non-fatal: {payload!r}",
    )

# Invalid entries are ignored and valid entries retain chronological order.
logs = chronological_log_entries(
    {
        "logs": [
            {"timestamp": "03", "message": "latest"},
            None,
            {"timestamp": "01", "message": "earliest"},
        ]
    }
)
check([entry["timestamp"] for entry in logs] == ["01", "03"], "log order")

# A successful material operation is never painted red merely because the
# marker/artifact has not reached Render's eventually-consistent log index yet.
pending = terminal_evidence_verdict("succeeded", None)
check(pending.state == "EVIDENCE_PENDING", "successful job is evidence-pending")
check(pending.fatal is False, "delayed marker is not fatal")

# The same operation upgrades to proven when a later collector sees the marker.
proven = terminal_evidence_verdict(
    "succeeded",
    'ONX_BACKUP_SUMMARY {"outcome":"PASS"}',
)
check(proven.state == "PROVEN", "late marker proves the operation")
check(proven.fatal is False, "proven operation is non-fatal")

# Real material failure and a non-terminal/unknown job remain hard failures.
for status, expected in (
    ("failed", "MATERIAL_OPERATION_FAILED"),
    ("canceled", "MATERIAL_OPERATION_FAILED"),
    (None, "MATERIAL_OPERATION_UNPROVEN"),
    ("running", "MATERIAL_OPERATION_UNPROVEN"),
):
    verdict = terminal_evidence_verdict(status, None)
    check(verdict.state == expected, f"{status!r} classification")
    check(verdict.fatal is True, f"{status!r} stays fatal")

print(f"IU-P0-6 evidence collector: PASS ({checks} checks)")
