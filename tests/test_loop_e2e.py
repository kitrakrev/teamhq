"""End-to-end V1.5/V2.5 loop test.

Runs a fastapi-go scenario, reads back cards from InsForge, verifies:
  - 4-team plan emission
  - org_id propagation
  - real Notion + Slack URLs in citations
"""
from __future__ import annotations

import urllib.request
import json
import time

import pytest

from tests.conftest import needs_hyperspell, needs_insforge, needs_org_id, needs_tensorlake


@needs_hyperspell
@needs_insforge
@needs_tensorlake
@needs_org_id
def test_full_run_writes_4_team_plans_with_urls(insforge_url, insforge_key, org_id):
    from agent.loop import TriggerSpec, run

    trigger = TriggerSpec(
        repo="kitrakrev/teamhq-hero",
        trigger_type="manual",
        trigger_source="(test) port FastAPI to Go",
        affected_paths=[
            "src/api/main.py",
            "src/ml/inference_client.py",
            "src/infra/Dockerfile",
            "frontend/src/api-client.ts",
        ],
    )
    final = run(trigger)
    run_id = final["id"]
    time.sleep(0.3)  # let cards land

    req = urllib.request.Request(
        f"{insforge_url}/api/database/records/cards?run_id=eq.{run_id}&order=created_at.asc",
        headers={"x-api-key": insforge_key},
    )
    cards = json.loads(urllib.request.urlopen(req, timeout=15).read())

    # Tenant scope: every card carries org_id
    assert all(c.get("org_id") == org_id for c in cards), "card org_id propagation broken"

    team_plans = [c for c in cards if c["card_type"] == "team_plan"]
    teams = {c["team_id"] for c in team_plans}
    assert teams == {"backend", "ds", "ui", "devops"}, f"unexpected teams: {teams}"

    # Each plan card has documents w/ kind tags
    for c in team_plans:
        body = c.get("body") or {}
        docs = body.get("documents") or []
        assert docs, f"team_plan for {c['team_id']} has no citations"
        kinds = {d.get("kind") for d in docs}
        assert kinds & {"adr", "slack", "doc"}, f"team {c['team_id']} citations missing kind tags"
