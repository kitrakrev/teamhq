"""Per-team brain via Hyperspell memories.search(answer=True).

Each team is a `metadata.team` filter inside Hyperspell vault. The seed_*.py
scripts add memories tagged with the team. At query time we filter by team to
get a synthesized answer scoped to that team's brain.

Citations are enriched with:
  - source kind (slack/notion/adr/doc)
  - clickable URL when available (real Notion page URL for ADRs,
    Slack channel link for slack-tagged memories)

LLM model: gpt-oss-120b (open-weights, free with our key, returns coherent
answers in our smoke tests).
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from hyperspell import Hyperspell

_client: Hyperspell | None = None

ANSWER_MODEL = "gpt-oss-120b"

# Loaded once: team -> Notion ADR URL (written by scripts/notion_seed.py)
_ADR_PATH = Path(__file__).resolve().parent / "_notion_adrs.json"
NOTION_ADRS: dict[str, dict[str, str]] = (
    json.loads(_ADR_PATH.read_text()) if _ADR_PATH.exists() else {}
)

# Slack channel routing (from earlier seed; persona-tagged channels)
SLACK_CHANNELS: dict[str, dict[str, str]] = {
    "backend": {"id": "C0B2P8T20MT", "name": "#backend"},
    "ds":      {"id": "C0B2SL81XHQ", "name": "#ds"},
    "ui":      {"id": "C0B3M1C9708", "name": "#ui"},
    "devops":  {"id": "C0B2UK1LU8H", "name": "#devops"},
}
SLACK_TEAM = "T0B2P7SQYKX"


def _slack_channel_url(team_clean: str) -> str | None:
    info = SLACK_CHANNELS.get(team_clean)
    if not info:
        return None
    return f"https://teamhq-corp.slack.com/archives/{info['id']}"


def client() -> Hyperspell:
    global _client
    if _client is None:
        _client = Hyperspell(api_key=os.environ["HYPERSPELL_API_KEY"])
    return _client


def _scope(team: str) -> str:
    """Canonical collection name. Existing memories use `team-<id>` shape."""
    return team if team.startswith("team-") else f"team-{team}"


def add_memory(*, team: str, title: str, text: str, kind: str = "doc") -> dict[str, Any]:
    """Append a single artifact to the vault, tagged with team + kind."""
    scope = _scope(team)
    res = client().memories.add(
        title=title,
        text=text,
        collection=scope,
        metadata={"team": scope, "kind": kind},
    )
    return {"resource_id": getattr(res, "resource_id", None), "status": getattr(res, "status", None)}


def ask(*, team: str, question: str, max_results: int = 5) -> dict[str, Any]:
    """Ask the team's brain a question. Returns answer + cited documents.

    Uses Hyperspell's open-weights LLM (gpt-oss-120b) to synthesize an answer
    grounded in the team-tagged memories.
    """
    scope = _scope(team)
    res = client().memories.search(
        query=question,
        sources=["vault"],
        answer=True,
        max_results=max_results,
        options={
            "answer_model": ANSWER_MODEL,
            "filter": {"team": scope},
        },
    )
    team_clean = team.replace("team-", "")
    docs: list[dict[str, Any]] = []
    for d in getattr(res, "documents", None) or []:
        title = getattr(d, "title", None) or ""
        text = (getattr(d, "text", "") or "")[:500]
        meta = getattr(d, "metadata", None)
        kind = getattr(meta, "source_kind", None) or _infer_kind(title, text)
        url = _resolve_url(kind, team_clean, title)
        docs.append({
            "title": title,
            "text": text,
            "score": getattr(d, "score", None),
            "resource_id": getattr(d, "resource_id", None),
            "kind": kind,                # 'adr' | 'slack' | 'doc'
            "url": url,                  # clickable when known
            "channel": SLACK_CHANNELS.get(team_clean, {}).get("name") if kind == "slack" else None,
        })
    return {
        "answer": getattr(res, "answer", None),
        "documents": docs,
        "team": team_clean,
        "model": ANSWER_MODEL,
    }


def _infer_kind(title: str, text: str) -> str:
    """Heuristic when metadata.source_kind isn't present on the doc."""
    t = (title or "").lower()
    if t.startswith("adr") or "adr-" in t:
        return "adr"
    if "slack" in t or t.startswith("#"):
        return "slack"
    return "doc"


def _resolve_url(kind: str, team: str, title: str) -> str | None:
    """Pick the right URL for a citation chip in the UI."""
    if kind == "adr":
        adr = NOTION_ADRS.get(team)
        if adr and adr.get("url"):
            return adr["url"]
    if kind == "slack":
        return _slack_channel_url(team)
    return None
