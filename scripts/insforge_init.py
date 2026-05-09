"""Idempotent InsForge schema + seed init.

Re-runnable. Creates/upserts:
  - users / runs / cards / decisions / audit_log tables
  - 4 demo users (Sarah / Iris / Alice / Grace)

Used after re-provisioning a new project (the trial-claim hiccup we hit).
"""
from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request
import json
from pathlib import Path

env = Path(__file__).resolve().parent.parent / ".env"
for line in env.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip())

URL = os.environ["INSFORGE_PROJECT_URL"]
KEY = os.environ["INSFORGE_ACCESS_API_KEY"]


def req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        URL + path,
        data=data,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            payload = resp.read().decode()
            try:
                return resp.status, (json.loads(payload) if payload else None)
            except json.JSONDecodeError:
                return resp.status, payload
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def wait_ready(max_s: int = 180) -> None:
    """Poll project URL until non-503."""
    import time

    deadline = time.time() + max_s
    while time.time() < deadline:
        code, _ = req("GET", "/health")
        if code == 200:
            return
        time.sleep(2)
    raise RuntimeError("project never came up")


SCHEMAS: list[tuple[str, list[dict]]] = [
    ("users", [
        {"columnName": "name", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "email", "type": "string", "isNullable": False, "isUnique": True},
        {"columnName": "role", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "team", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "github_login", "type": "string", "isNullable": True, "isUnique": False},
    ]),
    ("runs", [
        {"columnName": "repo", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "trigger_type", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "trigger_source", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "status", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "started_at", "type": "datetime", "isNullable": True, "isUnique": False},
        {"columnName": "finished_at", "type": "datetime", "isNullable": True, "isUnique": False},
        {"columnName": "pr_url", "type": "string", "isNullable": True, "isUnique": False},
    ]),
    ("cards", [
        {"columnName": "run_id", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "card_type", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "team_id", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "title", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "body", "type": "json", "isNullable": True, "isUnique": False},
        {"columnName": "visibility", "type": "json", "isNullable": True, "isUnique": False},
        {"columnName": "status", "type": "string", "isNullable": True, "isUnique": False},
    ]),
    ("decisions", [
        {"columnName": "run_id", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "file_path", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "change_class", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "reasoning", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "cited_sources", "type": "json", "isNullable": True, "isUnique": False},
        {"columnName": "approver_role", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "approver_user", "type": "string", "isNullable": True, "isUnique": False},
    ]),
    ("audit_log", [
        {"columnName": "actor", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "action", "type": "string", "isNullable": False, "isUnique": False},
        {"columnName": "target_type", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "target_id", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "recipient_user", "type": "string", "isNullable": True, "isUnique": False},
        {"columnName": "source_visibility", "type": "json", "isNullable": True, "isUnique": False},
    ]),
]

USERS = [
    ("Sarah", "sarah@teamhq.demo", "lead", "backend", "sarah-bk"),
    ("Iris", "iris@teamhq.demo", "lead", "ds", "iris-ds"),
    ("Alice", "alice@teamhq.demo", "lead", "ui", "alice-ui"),
    ("Grace", "grace@teamhq.demo", "lead", "devops", "grace-do"),
]


def main() -> int:
    print(f"InsForge URL: {URL}")
    print("Waiting for project to come up...")
    wait_ready()
    print("  ready.")
    print()

    code, existing = req("GET", "/api/database/tables")
    existing_set = set(existing or [])
    print(f"Existing tables: {sorted(existing_set)}")
    print()

    for name, columns in SCHEMAS:
        if name in existing_set:
            print(f"  table {name}: already exists, skip")
            continue
        code, body = req("POST", "/api/database/tables",
                         {"tableName": name, "columns": columns})
        if code in (200, 201):
            print(f"  table {name}: created")
        else:
            print(f"  table {name}: create failed (HTTP {code}): {body!r}")
            return 1

    print()
    print("Seeding 4 demo users (idempotent: skip on duplicate email)...")
    for n, email, role, team, gh in USERS:
        code, body = req("POST", "/api/database/records/users",
                         {"name": n, "email": email, "role": role,
                          "team": team, "github_login": gh})
        if code in (200, 201):
            print(f"  + {n:6s} ({team:7s})")
        else:
            # likely duplicate email -> skip
            print(f"  = {n:6s} ({team:7s}) skipped: HTTP {code}")

    print()
    code, users = req("GET", "/api/database/records/users")
    print(f"Total users now: {len(users) if isinstance(users, list) else '?'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
