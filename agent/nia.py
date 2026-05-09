"""Thin wrapper for Nia world-context retrieval.

Nia exposes `POST /search` with three modes today:
  - deep | universal | web   → externalized to their MCP layer ("wave 1")
  - mode-less retrieval over indexed sources via /sources

For V1 we just confirm the key works and return a stub. Real source indexing
will use Nia's MCP server (already registered via `claude mcp add nia`).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


BASE = "https://api.trynia.ai"


def _request(method: str, path: str, body: dict | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {os.environ['NIA_API_KEY']}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return {"error": e.code, "message": e.read().decode()[:300]}


def list_sources() -> dict:
    return _request("GET", "/sources")


def list_repositories() -> dict:
    return _request("GET", "/repositories")


def search(query: str, mode: str = "universal") -> dict:
    """Send a query to Nia. Modes today externalize to MCP for full LLM answers.

    For V1 callers, treat empty/externalized response as "Nia knows about this
    domain but full answer requires MCP path" — we display the citation chain
    differently in that case.
    """
    return _request("POST", "/search", {"mode": mode, "messages": [{"role": "user", "content": query}]})
