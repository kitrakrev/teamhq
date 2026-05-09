"""Card emission — every state change writes to the `cards` table.

Card types (stable contract, frontend keys off these):
    trigger      a run started
    team_plan    per-team plan (one card per team)
    world_ctx    Nia world-context citation chunk
    test_result  pytest/jest/go test output from sandbox
    pr_opened    PR URL appears
    error        loop failed; terminal card
"""
from __future__ import annotations

from typing import Any

from .insforge import insert


def emit(
    *,
    run_id: str,
    card_type: str,
    title: str,
    body: dict,
    org_id: str | None = None,
    team_id: str | None = None,
    visibility: dict | None = None,
    status: str = "info",
) -> dict[str, Any]:
    row = {
        "org_id": org_id,
        "run_id": run_id,
        "card_type": card_type,
        "team_id": team_id,
        "title": title,
        "body": body,
        "visibility": visibility or {"read": ["*"], "act": []},
        "status": status,
    }
    return insert("cards", row)
