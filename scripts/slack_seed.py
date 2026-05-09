"""Seed #backend and #ds with realistic team-convention messages.

These become the source artifacts Hyperspell ingests for our Track 4 demo:
removing Hyperspell = agent loses team brain = generic migration breaks tests.
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

env = Path(__file__).resolve().parent.parent / ".env"
if env.exists():
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

TOKEN = os.environ.get("SLACK_BOT_TOKEN")
if not TOKEN:
    print("ERROR: SLACK_BOT_TOKEN missing", file=sys.stderr)
    sys.exit(1)

CHANNELS = {
    "backend": "C0B2P8T20MT",
    "ds": "C0B2SL81XHQ",
}

BACKEND_MSGS = [
    "Quick reminder for the team — please don't replace our retry_wrapper when migrating openai SDK calls. PR #347 reverted @field_validator approach last quarter due to perf regression in batch jobs. Wrapper stays.",
    "Sarah here — I own the retry_wrapper. If you're touching it, ping me first. Test coverage on retry paths is light because we mock the OpenAI client; real failures only show up under load.",
    "Heads up on Pydantic v2 — model_config dict style breaks our snake_case JSON aliases. We agreed in Aug 2024 design review to keep `class Config` nested style. Don't switch.",
    "Re: openai SDK v1 migration — we use streaming opt-in only. Default-on streaming caused incident INC-203 (S3 upload timeouts when caller didn't drain). Keep the explicit flag.",
    "Tenacity for backoff. Fixed cap at 30s. Don't bump without DevOps signoff — we have SLA windows that depend on this exact ceiling.",
    "Pydantic models touching OpenAI responses: NEVER use @field_validator. Use the legacy @validator until we figure out the perf path. PR #347 has the postmortem.",
]

DS_MSGS = [
    "Streaming completions are required for our embeddings pipeline. We can't fall back to sync — costs us 4x in batch wall-clock time and our nightly job blows the cron window.",
    "Iris on inference: we standardize on the sklearn-compatible interface for ML calls. Don't import openai.ChatCompletion directly into pipelines — it bypasses our retry + telemetry layer.",
    "Reminder — never call sync OpenAI API in batch jobs. Postmortem #INC-203 covers why. Use streaming + async wrapper from `ml/inference.py`.",
    "When openai SDK v1 lands here, audit the embedding endpoint first. We pin model versions; auto-bump breaks reproducibility for our experiments.",
]


def post(channel_id, text):
    body = json.dumps({"channel": channel_id, "text": text}).encode()
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=body,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def seed(channel_name, channel_id, msgs):
    print(f"\n=== {channel_name} ({channel_id}) ===")
    for m in msgs:
        r = post(channel_id, m)
        ok = r.get("ok")
        ts = r.get("ts", "?")
        snippet = m[:60].replace("\n", " ")
        print(f"  ok={ok} ts={ts}  {snippet!r}")
        if not ok:
            print(f"   error: {r.get('error')}")
        time.sleep(0.3)  # avoid rate limit


seed("backend", CHANNELS["backend"], BACKEND_MSGS)
seed("ds", CHANNELS["ds"], DS_MSGS)
print("\nOK")
