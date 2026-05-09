"""Persona module — pure-Python, no external calls."""
from __future__ import annotations

from agent.personas import (
    PERSONAS,
    architect,
    by_team,
    can_override,
    role_rank,
    slack_post_kwargs,
)


def test_4_team_leads_present():
    leads = [p for p in PERSONAS.values() if p.role == "lead"]
    teams = sorted(p.team for p in leads)
    assert teams == ["backend", "devops", "ds", "ui"]


def test_each_lead_has_real_github_login():
    for p in (PERSONAS[k] for k in ("sarah", "iris", "alice", "grace")):
        assert p.github_login, f"{p.name} missing github_login"
        # No spaces / special chars beyond `-`
        assert all(c.isalnum() or c in "-_" for c in p.github_login)


def test_by_team_returns_lead_only():
    backend = by_team("backend")
    assert len(backend) == 1
    assert backend[0].name == "Sarah Chen"


def test_role_rank_hierarchy():
    assert role_rank("viewer") < role_rank("member") < role_rank("lead") < role_rank("architect") < role_rank("org_owner")


def test_architect_overrides_lead():
    assert can_override(architect(), PERSONAS["sarah"]) is True
    # PM proposes but cannot override engineering decisions
    assert can_override(PERSONAS["frank"], PERSONAS["sarah"]) is False
    # Same-rank leads do not override each other (deadlock case)
    assert can_override(PERSONAS["sarah"], PERSONAS["iris"]) is False


def test_slack_post_kwargs_shape():
    kw = slack_post_kwargs(PERSONAS["sarah"])
    assert kw["username"] == "Sarah Chen"
    assert kw["icon_emoji"].startswith(":") and kw["icon_emoji"].endswith(":")
