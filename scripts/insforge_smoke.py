"""InsForge smoke test. Verifies project URL, auth, table CRUD, record CRUD.

Findings (May 9 2026):
- Auth header: `x-api-key: <accessApiKey>` (Authorization: Bearer also works)
- Tables endpoint:    /api/database/tables
- Records endpoint:   /api/database/records/<tableName>     (NOT /tables/<name>/records)
- CreateTableRequest schema (real, not docs):
    { "tableName": str,
      "columns": [{ "columnName": str, "type": <enum>, "isNullable": bool, "isUnique": bool, ... }] }
- Auto-fields added by InsForge: id, created_at, updated_at (don't declare them)
- Column types: string, datetime, integer, float, boolean, uuid, json, file
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

env = Path(__file__).resolve().parent.parent / ".env"
if env.exists():
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

URL = os.environ.get("INSFORGE_PROJECT_URL")
KEY = os.environ.get("INSFORGE_ACCESS_API_KEY")

if not URL or not KEY:
    print("ERROR: INSFORGE_PROJECT_URL or INSFORGE_ACCESS_API_KEY missing", file=sys.stderr)
    sys.exit(1)


def req(method, path, body=None):
    headers = {"x-api-key": KEY, "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            payload = resp.read().decode()
            return resp.status, payload
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


print(f"Project: {URL}")

print("\n[1] /health")
print(req("GET", "/health"))

print("\n[2] List tables (empty expected)")
print(req("GET", "/api/database/tables"))

print("\n[3] Create _smoke table")
status, body = req(
    "POST",
    "/api/database/tables",
    {
        "tableName": "_smoke",
        "columns": [
            {"columnName": "value", "type": "string", "isNullable": True, "isUnique": False},
        ],
    },
)
print(status, body[:200])

print("\n[4] List tables (expect _smoke)")
print(req("GET", "/api/database/tables"))

print("\n[5] Insert record")
status, body = req("POST", "/api/database/records/_smoke", {"value": "hello-from-teamhq"})
print(status, body[:200])

print("\n[6] Read records")
print(req("GET", "/api/database/records/_smoke"))

print("\n[7] Drop _smoke")
print(req("DELETE", "/api/database/tables/_smoke"))

print("\nOK")
