"""Give the 6 demo personas real email+password logins so judges can sign in
through the standard form (not just the persona-cookie demo path).

What it does for each persona:
  1. POST /api/auth/users on InsForge (creates the auth user; idempotent —
     409 means already present, which is fine).
  2. Look up the resulting auth user UUID.
  3. Locate the seeded `users` row by email and the `org_members` row that
     points at it; repoint `org_members.user_id` to the new auth UUID and
     update the `users.id` so all FKs stay consistent.

After this runs, judges can log in at /login w/ the printed credentials.

Usage:
    python scripts/seed_persona_auth.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))


def _load_env() -> None:
    env = REPO / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


_load_env()


URL = os.environ["INSFORGE_PROJECT_URL"]
KEY = os.environ["INSFORGE_ACCESS_API_KEY"]
PASSWORD = os.environ.get("TEAMHQ_PERSONA_PASSWORD", "teamhq-demo-2026")


PERSONAS = [
    ("sarah", "Sarah Chen",   "sarah@teamhq.demo"),
    ("iris",  "Iris Patel",   "iris@teamhq.demo"),
    ("alice", "Alice Rivera", "alice@teamhq.demo"),
    ("grace", "Grace Liu",    "grace@teamhq.demo"),
    ("dan",   "Dan Park",     "dan@teamhq.demo"),
    ("frank", "Frank Lee",    "frank@teamhq.demo"),
]


def _req(method: str, path: str, body: dict | None = None, *, no_key: bool = False) -> dict | list | None:
    headers = {"Content-Type": "application/json"}
    if not no_key:
        headers["x-api-key"] = KEY
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()[:400]
        raise RuntimeError(f"{method} {path} -> {e.code}: {body_txt}") from e


def create_auth_user(email: str, password: str, name: str) -> str:
    """POST /api/auth/users — public endpoint, no x-api-key. Returns auth uuid."""
    try:
        out = _req("POST", "/api/auth/users", {"email": email, "password": password, "name": name}, no_key=True)
        if isinstance(out, dict) and "user" in out:
            return out["user"]["id"]
    except RuntimeError as e:
        if "409" in str(e) or "already" in str(e).lower() or "exists" in str(e).lower():
            print(f"  · auth user exists; signing in to recover id")
            signin = _req("POST", "/api/auth/sessions", {"email": email, "password": password}, no_key=True)
            if isinstance(signin, dict) and "user" in signin:
                return signin["user"]["id"]
            raise
        raise
    raise RuntimeError("auth user create returned unexpected shape")


def find_users_row(email: str) -> dict | None:
    rows = _req("GET", f"/api/database/records/users?email=eq.{email}&limit=1")
    return rows[0] if isinstance(rows, list) and rows else None


def find_org_members(user_id: str) -> list[dict]:
    rows = _req("GET", f"/api/database/records/org_members?user_id=eq.{user_id}")
    return rows if isinstance(rows, list) else []


def patch_users_id(old_id: str, new_id: str) -> None:
    _req("PATCH", f"/api/database/records/users?id=eq.{old_id}", {"id": new_id})


def patch_org_members(old_user_id: str, new_user_id: str) -> None:
    _req("PATCH", f"/api/database/records/org_members?user_id=eq.{old_user_id}", {"user_id": new_user_id})


def main() -> int:
    print(f"Seeding persona auth on {URL}")
    print(f"Password for all personas: {PASSWORD}")
    print()
    for key, name, email in PERSONAS:
        print(f"[{key}] {email}")
        try:
            auth_id = create_auth_user(email, PASSWORD, name)
        except Exception as e:
            print(f"  ! auth-user step failed: {e}")
            continue
        print(f"  · auth_user_id = {auth_id}")

        seeded = find_users_row(email)
        if not seeded:
            print(f"  ! no seeded users row for {email}; skipping merge")
            continue
        old_id = seeded["id"]
        if old_id == auth_id:
            print(f"  · already merged (users.id == auth_user_id)")
            continue

        members = find_org_members(old_id)
        if members:
            patch_org_members(old_id, auth_id)
            print(f"  · repointed {len(members)} org_members row(s) → {auth_id}")
        # Update the users row id last so the FK move is atomic-ish.
        try:
            patch_users_id(old_id, auth_id)
            print(f"  · users.id {old_id} → {auth_id}")
        except Exception as e:
            print(f"  ! patch users.id failed (might be FK-constrained): {e}")

    print()
    print("Done. Login at /login with any persona email + the password above.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
