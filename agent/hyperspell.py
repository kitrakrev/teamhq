"""Per-team brain via Hyperspell memories.search(answer=True).

Each team is a `metadata.team` filter inside Hyperspell vault. The seed_*.py
scripts add memories tagged with the team. At query time we filter by team to
get a synthesized answer scoped to that team's brain.

LLM model: gpt-oss-120b (open-weights, free with our key, returns coherent
answers in our smoke tests).
"""
from __future__ import annotations

import os
from typing import Any

from hyperspell import Hyperspell

_client: Hyperspell | None = None

ANSWER_MODEL = "gpt-oss-120b"


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
    docs = [
        {
            "title": getattr(d, "title", None),
            "text": (getattr(d, "text", "") or "")[:500],
            "score": getattr(d, "score", None),
            "resource_id": getattr(d, "resource_id", None),
        }
        for d in (getattr(res, "documents", None) or [])
    ]
    return {
        "answer": getattr(res, "answer", None),
        "documents": docs,
        "team": team,
        "model": ANSWER_MODEL,
    }
