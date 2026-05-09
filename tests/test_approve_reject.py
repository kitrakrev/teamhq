"""End-to-end tests for the Approve/Reject API + audit log feature.

Hits the running Next.js dev server at http://localhost:3000 with the demo
persona cookie, and verifies that:
  - the latest team_plan card flips to status='approved'
  - audit_log gains a matching row
  - a viewer who is not the team's lead is rejected with 403
  - architect Dan can override
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import pytest

from tests.conftest import needs_insforge

WEB_BASE = os.environ.get("WEB_BASE", "http://localhost:3000")


def _http(method: str, url: str, *, headers: dict | None = None, data: dict | None = None):
    body = None
    hdr = dict(headers or {})
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=hdr)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            return e.code, {}


def _ifg_get(insforge_url: str, insforge_key: str, path: str):
    req = urllib.request.Request(
        insforge_url + path,
        headers={"x-api-key": insforge_key},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8") or "[]")


def _web_alive() -> bool:
    try:
        with urllib.request.urlopen(WEB_BASE + "/login", timeout=3) as r:
            return r.status < 500
    except Exception:
        return False


needs_web = pytest.mark.skipif(not _web_alive(), reason=f"web dev server not at {WEB_BASE}")


def _latest_team_plan_card(insforge_url: str, insforge_key: str, org_id: str, team: str | None = None):
    """Pick the most-recent team_plan card from the most recent run, optionally
    filtered by team_id. Falls back to global recent if the latest run has none."""
    runs = _ifg_get(
        insforge_url, insforge_key,
        f"/api/database/records/runs?org_id=eq.{org_id}&order=created_at.desc&limit=10",
    )
    for r in runs:
        q = (
            f"/api/database/records/cards?run_id=eq.{r['id']}&card_type=eq.team_plan"
            f"&org_id=eq.{org_id}&order=created_at.desc&limit=10"
        )
        cards = _ifg_get(insforge_url, insforge_key, q)
        if team:
            cards = [c for c in cards if c.get("team_id") == team]
        if cards:
            return cards[0]
    return None


@needs_insforge
@needs_web
def test_sarah_approves_backend_card_writes_audit(insforge_url, insforge_key, org_id):
    card = _latest_team_plan_card(insforge_url, insforge_key, org_id, team="backend")
    assert card, "no backend team_plan card found"

    status, body = _http(
        "POST",
        f"{WEB_BASE}/api/cards/{card['id']}/approve",
        headers={"Cookie": "teamhq_demo_persona=sarah"},
    )
    assert status == 200, f"expected 200 got {status}: {body}"
    assert body.get("ok") is True

    # Card row flipped
    rows = _ifg_get(insforge_url, insforge_key, f"/api/database/records/cards?id=eq.{card['id']}")
    assert rows and rows[0]["status"] == "approved"

    # Audit row exists
    time.sleep(0.5)
    audits = _ifg_get(
        insforge_url, insforge_key,
        f"/api/database/records/audit_log?target_id=eq.{card['id']}&action=eq.approve&order=created_at.desc&limit=5",
    )
    assert any(a["actor"] == "sarah@teamhq.demo" for a in audits), audits


@needs_insforge
@needs_web
def test_iris_cannot_approve_backend_card(insforge_url, insforge_key, org_id):
    card = _latest_team_plan_card(insforge_url, insforge_key, org_id, team="backend")
    assert card, "no backend team_plan card found"

    status, body = _http(
        "POST",
        f"{WEB_BASE}/api/cards/{card['id']}/approve",
        headers={"Cookie": "teamhq_demo_persona=iris"},
    )
    assert status == 403, f"expected 403 got {status}: {body}"


@needs_insforge
@needs_web
def test_dan_architect_can_override(insforge_url, insforge_key, org_id):
    # Pick any team_plan card; Dan is architect and can override regardless of team.
    card = _latest_team_plan_card(insforge_url, insforge_key, org_id)
    assert card, "no team_plan card found"

    status, body = _http(
        "POST",
        f"{WEB_BASE}/api/cards/{card['id']}/override",
        headers={"Cookie": "teamhq_demo_persona=dan"},
        data={"reason": "architect override during test"},
    )
    assert status == 200, f"expected 200 got {status}: {body}"
    assert body.get("ok") is True

    rows = _ifg_get(insforge_url, insforge_key, f"/api/database/records/cards?id=eq.{card['id']}")
    assert rows and rows[0]["status"] == "overridden"

    time.sleep(0.5)
    audits = _ifg_get(
        insforge_url, insforge_key,
        f"/api/database/records/audit_log?target_id=eq.{card['id']}&action=eq.override&order=created_at.desc&limit=5",
    )
    assert any(a["actor"] == "dan@teamhq.demo" for a in audits), audits
