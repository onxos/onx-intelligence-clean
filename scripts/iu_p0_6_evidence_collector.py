"""Pure helpers for IU-P0-6's eventually-consistent Render evidence.

Render can mark a one-off job successful before its log index exposes the final
ONX_* result marker.  Missing optional log arrays must likewise be treated as
an empty observation, not as a collector crash.  These helpers deliberately do
not make network calls so the acceptance behavior can be tested offline.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EvidenceVerdict:
    state: str
    fatal: bool


def chronological_log_entries(payload: Any) -> list[dict[str, Any]]:
    """Return valid Render ``direction=backward`` logs oldest-first.

    The Render API supplies newest-first entries for that requested direction;
    this helper normalizes optional payload shapes and reverses that documented
    response order. It intentionally does not sort arbitrary log collections.
    """

    if not isinstance(payload, dict):
        return []
    entries = payload.get("logs")
    if not isinstance(entries, list):
        return []
    return list(reversed([entry for entry in entries if isinstance(entry, dict)]))


def terminal_evidence_verdict(
    job_status: str | None,
    result_line: str | None,
) -> EvidenceVerdict:
    """Separate material job truth from eventually-consistent evidence truth."""

    if job_status == "succeeded":
        if result_line:
            return EvidenceVerdict("PROVEN", False)
        return EvidenceVerdict("EVIDENCE_PENDING", False)
    if job_status in {"failed", "canceled"}:
        return EvidenceVerdict("MATERIAL_OPERATION_FAILED", True)
    return EvidenceVerdict("MATERIAL_OPERATION_UNPROVEN", True)
