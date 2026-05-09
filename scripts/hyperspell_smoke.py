"""Hyperspell smoke test. Real SDK API surface.

API key (server-side) supports memories.add / memories.search.
Connections.list requires a per-user token (auth.user_token + as-user header).
"""
import os
import sys
from pathlib import Path

env = Path(__file__).resolve().parent.parent / ".env"
if env.exists():
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

if not os.environ.get("HYPERSPELL_API_KEY"):
    print("ERROR: HYPERSPELL_API_KEY missing", file=sys.stderr)
    sys.exit(1)

from hyperspell import Hyperspell

client = Hyperspell(api_key=os.environ["HYPERSPELL_API_KEY"])

print("=== auth.me ===")
try:
    me = client.auth.me()
    print(f"  me: {me}")
except Exception as e:
    print(f"  err: {type(e).__name__}: {e}")

# Per-team isolation via `collection` param.
TEAM = "team-backend"

print(f"\n=== memories.add (collection={TEAM!r}) ===")
try:
    m = client.memories.add(
        title="ADR-12 OpenAI client conventions",
        text=(
            "Backend team conventions for OpenAI SDK:\n"
            "1. All client calls wrapped in retry_wrapper (see PR #347).\n"
            "2. Avoid @field_validator on response models — perf regression in batch jobs.\n"
            "3. Streaming is opt-in via explicit flag; not default.\n"
            "Source: PR #347 reverted @field_validator after batch job timeouts."
        ),
        collection=TEAM,
        metadata={"team": TEAM, "source_kind": "adr"},
    )
    print(f"  status: {m}")
except Exception as e:
    print(f"  err: {type(e).__name__}: {e}")

print(f"\n=== memories.add (slack-style, collection={TEAM!r}) ===")
try:
    m = client.memories.add(
        title="#backend Slack — Sarah on retry wrapper",
        text=(
            "Sarah (@sarah): keep our retry_wrapper for openai calls. "
            "PR #347 was reverted because @field_validator broke batch jobs. "
            "Don't replace it during the v1 SDK migration."
        ),
        collection=TEAM,
        metadata={"team": TEAM, "source_kind": "slack", "channel": "#backend"},
    )
    print(f"  status: {m}")
except Exception as e:
    print(f"  err: {type(e).__name__}: {e}")

print(f"\n=== memories.search (sources=['vault']) ===")
try:
    res = client.memories.search(
        query="OpenAI retry wrapper team convention",
        sources=["vault"],
        max_results=5,
    )
    print(f"  type: {type(res).__name__}")
    # pull resulting memories
    items = getattr(res, "results", None) or getattr(res, "memories", None) or getattr(res, "data", None)
    if items is None:
        print(f"  raw: {res}")
    else:
        items = list(items)
        print(f"  hits: {len(items)}")
        for i, it in enumerate(items[:5]):
            t = getattr(it, "title", None) or (getattr(it, "text", "") or "?")[:80]
            score = getattr(it, "score", None)
            print(f"   [{i}] score={score} title={t!r}")
    ans = getattr(res, "answer", None)
    if ans:
        print(f"  answer: {ans}")
except Exception as e:
    print(f"  err: {type(e).__name__}: {e}")

print("\n=== integrations.list ===")
try:
    integ = client.integrations.list()
    print(f"  available providers: {integ}")
except Exception as e:
    print(f"  err: {type(e).__name__}: {e}")

print("\n=== auth.user_token (user-scoped flow for OAuth UI) ===")
try:
    tok = client.auth.user_token(user_id="demo-user-1")
    print(f"  token: {tok}")
except Exception as e:
    print(f"  err: {type(e).__name__}: {e}")

print("\nOK")
