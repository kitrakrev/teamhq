"""Thin REST wrapper for InsForge backend.

Auth: x-api-key header (server-side token from .env).
Auto-fields: id (uuid), created_at, updated_at — added per row by InsForge.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def _env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"missing env var: {name}")
    return v


def _url() -> str:
    return _env("INSFORGE_PROJECT_URL")


def _key() -> str:
    return _env("INSFORGE_ACCESS_API_KEY")


def _req(method: str, path: str, body: Any | None = None) -> Any:
    headers = {
        "x-api-key": _key(),
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(_url() + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            payload = resp.read().decode()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"insforge {method} {path} -> {e.code}: {e.read().decode()[:300]}") from e


def insert(table: str, row: dict) -> dict:
    """POST a single row. Returns inserted row (incl auto-fields)."""
    res = _req("POST", f"/api/database/records/{table}", row)
    if isinstance(res, list):
        return res[0] if res else row
    return res or row


def list_rows(table: str, *, limit: int = 100) -> list[dict]:
    return _req("GET", f"/api/database/records/{table}?limit={limit}") or []


def update(table: str, row_id: str, patch: dict) -> dict:
    """PostgREST-style update: PATCH /api/database/records/<table>?id=eq.<uuid>"""
    _req("PATCH", f"/api/database/records/{table}?id=eq.{row_id}", patch)
    return {"id": row_id, **patch}


def delete(table: str, row_id: str) -> None:
    _req("DELETE", f"/api/database/records/{table}?id=eq.{row_id}")
