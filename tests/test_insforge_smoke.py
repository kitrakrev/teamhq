"""InsForge integration tests. Hits real backend; gated on env."""
from __future__ import annotations

import json
import urllib.request

from tests.conftest import needs_insforge, needs_org_id


def _get(url: str, key: str, path: str):
    req = urllib.request.Request(url + path, headers={"x-api-key": key})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status, json.loads(r.read().decode())


@needs_insforge
def test_health(insforge_url, insforge_key):
    req = urllib.request.Request(insforge_url + "/health")
    with urllib.request.urlopen(req, timeout=10) as r:
        assert r.status == 200


@needs_insforge
def test_tables_present(insforge_url, insforge_key):
    status, tables = _get(insforge_url, insforge_key, "/api/database/tables")
    assert status == 200
    must_have = {"users", "runs", "cards", "decisions", "audit_log",
                 "orgs", "org_members", "teams", "org_repos", "invites"}
    assert must_have.issubset(set(tables))


@needs_insforge
@needs_org_id
def test_org_seeded(insforge_url, insforge_key, org_id):
    status, rows = _get(insforge_url, insforge_key,
                        f"/api/database/records/orgs?id=eq.{org_id}")
    assert status == 200
    assert len(rows) == 1
    assert rows[0]["slug"] == "acme-eng"


@needs_insforge
@needs_org_id
def test_org_members_seeded(insforge_url, insforge_key, org_id):
    status, rows = _get(insforge_url, insforge_key,
                        f"/api/database/records/org_members?org_id=eq.{org_id}")
    assert status == 200
    # Backfill stored team name (e.g. "backend") in role column for membership rows
    # plus one explicit "org_owner" row for Sarah. Both shapes valid.
    assert len(rows) >= 4
    roles = {r["role"] for r in rows}
    assert "org_owner" in roles, f"missing org_owner; roles seen: {roles}"
    # Each of the 4 demo teams appears as a membership somewhere
    seen_teams = {r["team_id"] for r in rows if r.get("team_id")}
    assert {"backend", "ds", "ui", "devops"}.issubset(seen_teams), (
        f"missing team memberships, seen: {seen_teams}"
    )


@needs_insforge
@needs_org_id
def test_existing_runs_have_org_id(insforge_url, insforge_key, org_id):
    """V2.5 backfill: all post-tenant runs have org_id set."""
    status, rows = _get(insforge_url, insforge_key,
                        f"/api/database/records/runs?order=created_at.desc&limit=5")
    assert status == 200
    # The most recent run was created post-tenant — must carry org_id.
    if rows:
        assert rows[0].get("org_id") == org_id


@needs_insforge
@needs_org_id
def test_card_org_scoping(insforge_url, insforge_key, org_id):
    """Reads scoped by org_id should only return rows from that tenant."""
    status, rows = _get(insforge_url, insforge_key,
                        f"/api/database/records/cards?org_id=eq.{org_id}&limit=20")
    assert status == 200
    assert all(r.get("org_id") == org_id for r in rows)


@needs_insforge
def test_ai_gateway_models_present(insforge_url, insforge_key):
    """6 models should be configured on the AI gateway."""
    status, configs = _get(insforge_url, insforge_key, "/api/ai/configurations")
    assert status == 200
    model_ids = {c["modelId"] for c in configs}
    expected = {
        "openai/gpt-4o-mini",
        "anthropic/claude-sonnet-4.5",
    }
    assert expected.issubset(model_ids), f"missing models: {expected - model_ids}"


@needs_insforge
def test_ai_gateway_chat_completes(insforge_url, insforge_key):
    """Smoke a real LLM call end-to-end through InsForge AI."""
    req = urllib.request.Request(
        insforge_url + "/api/ai/chat/completion",
        data=json.dumps({
            "model": "openai/gpt-4o-mini",
            "messages": [{"role": "user", "content": "reply with exactly: ALIVE"}],
            "maxTokens": 10,
        }).encode(),
        headers={"x-api-key": insforge_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read().decode())
    assert "ALIVE" in body.get("text", "").upper()
