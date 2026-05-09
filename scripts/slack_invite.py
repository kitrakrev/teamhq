"""Invite the 3 demo personas to teamhq-corp Slack workspace.

Uses chat.postMessage instead of admin.users.invite (which requires admin
scopes the free Slack tier doesn't grant). Workflow:

1. We post a message in #general w/ a magic invite link the user clicks.
2. Or — simpler — workspace admin pre-creates an invite link in Slack UI
   and shares it. The 3 users sign up via that link w/ +alias emails.

This script DOES:
  - Print the canonical workspace invite URL (admin must enable open invites)
  - List existing users for verification

Manual step required:
  Visit https://teamhq-corp.slack.com/admin/invites and:
    - Enable "Anyone can join" or
    - Create a single magic invite link with no expiry
  Share link with 3 +alias emails:
    karthikraja+sarah@gmail.com
    karthikraja+iris@gmail.com
    karthikraja+alice@gmail.com
  Each click = real Slack signup.
"""
from __future__ import annotations
import os
import json
import urllib.request
from pathlib import Path

env = Path(__file__).resolve().parent.parent / ".env"
for line in env.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip())

TOKEN = os.environ["SLACK_BOT_TOKEN"]


def call(method: str, body: dict | None = None, qs: str = "") -> dict:
    if body is None:
        # GET-ish endpoint
        req = urllib.request.Request(
            f"https://slack.com/api/{method}{qs}",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
    else:
        req = urllib.request.Request(
            f"https://slack.com/api/{method}",
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json; charset=utf-8",
            },
        )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


print("=== Current users in teamhq-corp ===")
r = call("users.list")
users = r.get("members", [])
for u in users:
    if u.get("deleted") or u.get("is_bot"):
        continue
    name = u.get("real_name") or u.get("name")
    email = u.get("profile", {}).get("email", "—")
    print(f"  {u['id']}  {name}  {email}")

print()
print(f"Total non-bot users: {sum(1 for u in users if not u.get('deleted') and not u.get('is_bot'))}")
print()
print("=== Manual invite step ===")
print("1. Open: https://teamhq-corp.slack.com/admin/invites")
print("   (or workspace -> Invite people)")
print("2. Send invites to:")
print("   - karthikraja+sarah@gmail.com  (will become 'Sarah Chen')")
print("   - karthikraja+iris@gmail.com   (will become 'Iris Patel')")
print("   - karthikraja+alice@gmail.com  (will become 'Alice Rivera')")
print("3. Open each invite email in Gmail, accept, set the display name shown above.")
print("4. Re-run this script — should show 3 new users.")
