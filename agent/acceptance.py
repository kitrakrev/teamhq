"""Acceptance criteria generator.

For new-feature triggers (PM-driven), the agent emits an acceptance_criteria
card BEFORE planning. Each criterion is a checkable item (description +
optional test command). Plans don't execute until at least N criteria are
approved by the affected team leads.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from . import llm


@dataclass
class Criterion:
    id: str
    statement: str
    kind: str            # 'test' | 'check' | 'review'
    test_command: str | None
    expected: str | None
    owner_role: str      # team key + role e.g. 'team_lead:backend'
    status: str = "pending"  # pending | passed | failed | waived


def generate(*, feature: str, teams: list[str], context: str = "") -> list[Criterion]:
    """Ask Claude Sonnet 4.5 to draft 3-5 AC items for this feature.

    Output is structured JSON. Each criterion picks a team owner.
    """
    sys_prompt = (
        "You output ONLY a single JSON array of acceptance-criteria objects. "
        "No prose, no fences. Each item has: "
        '"statement" (string), '
        '"kind" ("test"|"check"|"review"), '
        '"test_command" (string or null — shell command to verify), '
        '"expected" (string or null — what passing looks like), '
        '"team" (one of: backend, ds, ui, devops). '
        "Produce 3-5 items. Cover the feature end-to-end."
    )
    user_prompt = (
        f"FEATURE: {feature}\n"
        f"AFFECTED TEAMS: {', '.join(teams)}\n"
        f"{('CONTEXT: ' + context + chr(10)) if context else ''}"
        "Draft acceptance criteria as a JSON array now."
    )

    try:
        text = llm.chat(
            messages=[{"role": "user", "content": user_prompt}],
            system_prompt=sys_prompt,
            model="anthropic/claude-sonnet-4.5",
            max_tokens=900,
            temperature=0.1,
        ).get("text", "")
    except Exception:
        return _fallback(feature, teams)

    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)

    parsed = None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\[[\s\S]*\]", text)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = None
    if not isinstance(parsed, list):
        return _fallback(feature, teams)

    out: list[Criterion] = []
    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue
        team = (item.get("team") or "backend").lower()
        if team not in teams and teams:
            team = teams[0]
        statement = (
            item.get("statement")
            or item.get("description")
            or item.get("criterion")
            or item.get("text")
            or ""
        )
        if not statement:
            continue
        out.append(Criterion(
            id=f"ac-{i+1}",
            statement=statement,
            kind=item.get("kind", "check"),
            test_command=item.get("test_command") or item.get("command"),
            expected=item.get("expected") or item.get("expected_outcome"),
            owner_role=f"team_lead:{team}",
        ))
    return out or _fallback(feature, teams)


def _fallback(feature: str, teams: list[str]) -> list[Criterion]:
    """Static fallback if LLM fails — covers the common shape for code change."""
    primary = teams[0] if teams else "backend"
    return [
        Criterion(
            id="ac-1",
            statement=f"Existing test suite passes after shipping: {feature}",
            kind="test",
            test_command="pytest -v",
            expected="exit_code == 0",
            owner_role=f"team_lead:{primary}",
        ),
        Criterion(
            id="ac-2",
            statement="Public API contract unchanged unless explicitly versioned",
            kind="review",
            test_command=None,
            expected=None,
            owner_role=f"team_lead:{primary}",
        ),
        Criterion(
            id="ac-3",
            statement="No new high-severity lint or type errors introduced",
            kind="test",
            test_command="ruff check . && mypy .",
            expected="exit_code == 0",
            owner_role=f"team_lead:{primary}",
        ),
    ]
