"""Tiny HTTP tunnel that exposes the local `claude` CLI as a streaming endpoint.

Pair w/ ngrok to give Vercel/prod a way to reach the laptop's Claude Code:

    pip install fastapi uvicorn
    export TEAMHQ_TUNNEL_SECRET=karthik-$(openssl rand -hex 8)
    .venv/bin/python scripts/claude_tunnel.py
    # in another terminal:
    ngrok http 8765
    # take the https://xyz.ngrok-free.app URL → set CLAUDE_TUNNEL_URL on Vercel

Endpoints
---------
GET  /health            → {"ok": true}; cheap liveness probe.
POST /chat              → SSE stream. Headers required:
                              X-TeamHQ-Auth: <TEAMHQ_TUNNEL_SECRET>
                          Body JSON: {"prompt": str, "system_prompt": str?,
                                       "session_id": str?}
                          Response: text/event-stream, one event per Claude token.
                          Final event has data="[[DONE]]" then closes.

Auth model: single shared secret in `X-TeamHQ-Auth` header. Match exact only.
For production swap to JWT / per-tenant tokens.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
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

try:
    from fastapi import FastAPI, Header, HTTPException, Request
    from fastapi.responses import StreamingResponse, JSONResponse
except ImportError:
    print("Missing FastAPI. Install with: pip install fastapi uvicorn", file=sys.stderr)
    sys.exit(2)


SECRET = os.environ.get("TEAMHQ_TUNNEL_SECRET")
PORT = int(os.environ.get("TEAMHQ_TUNNEL_PORT", "8765"))

if not SECRET:
    print("ERROR: set TEAMHQ_TUNNEL_SECRET first.", file=sys.stderr)
    sys.exit(2)


app = FastAPI(title="TeamHQ Claude Tunnel")


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"ok": True, "claude_on_path": _has_claude()})


def _has_claude() -> bool:
    import shutil
    return shutil.which("claude") is not None


def _check_auth(provided: str | None) -> None:
    if not provided or provided != SECRET:
        raise HTTPException(status_code=401, detail="bad or missing X-TeamHQ-Auth")


@app.post("/reply")
async def reply(
    request: Request,
    x_teamhq_auth: str | None = Header(default=None, alias="X-TeamHQ-Auth"),
):
    """Self-contained reply pipeline.

    Caller (Vercel API route) POSTs:
      {prompt, system_prompt, card_id, run_id, org_id, project_id?, source_card_id?, author_name?}

    Tunnel:
      1. Returns 202 immediately (background-task on caller side already)
      2. Spawns claude -p in stream-json mode
      3. PATCHes the placeholder card body live as tokens arrive
      4. Parses trailing <route>...</route> tag for routing metadata
      5. Final PATCH sets kind/to_user/to_team + status

    Long-running streams stay inside the laptop process; Vercel function
    completes in <1s.
    """
    _check_auth(x_teamhq_auth)
    body = await request.json()
    if not _has_claude():
        raise HTTPException(status_code=503, detail="claude CLI not on PATH on tunnel host")

    card_id = body.get("card_id")
    if not card_id:
        raise HTTPException(status_code=400, detail="card_id required")

    import threading
    threading.Thread(target=_run_reply_pipeline, args=(body,), daemon=True).start()
    return JSONResponse({"ok": True, "card_id": card_id, "started": True}, status_code=202)


def _patch_card(card_id: str, payload: dict) -> None:
    import urllib.error, urllib.request

    url = os.environ["INSFORGE_PROJECT_URL"] + f"/api/database/records/cards?id=eq.{card_id}"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        method="PATCH",
        headers={
            "x-api-key": os.environ["INSFORGE_ACCESS_API_KEY"],
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except urllib.error.HTTPError as e:
        print(f"[reply] patch {e.code}: {e.read()[:200]!r}")
    except Exception as e:
        print(f"[reply] patch err: {e}")


def _run_reply_pipeline(body: dict) -> None:
    import re as _re
    import time as _time

    prompt: str = body.get("prompt") or ""
    system_prompt: str = body.get("system_prompt") or ""
    session_id: str | None = body.get("session_id")
    card_id: str = body.get("card_id") or ""
    source_card_id: str | None = body.get("source_card_id")
    author_name: str | None = body.get("author_name")

    cmd = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
    ]
    if system_prompt:
        cmd.extend(["--append-system-prompt", system_prompt])
    if session_id:
        cmd.extend(["--session-id", session_id])

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
    )

    accumulated: list[str] = []
    last_patch = 0.0
    try:
        assert proc.stdout
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            ev_type = ev.get("type")
            if ev_type == "stream_event":
                inner = ev.get("event") or {}
                if inner.get("type") == "content_block_delta":
                    delta = inner.get("delta") or {}
                    if delta.get("type") == "text_delta":
                        chunk = delta.get("text") or ""
                        if chunk:
                            accumulated.append(chunk)
                            now = _time.time()
                            if now - last_patch > 0.4:
                                last_patch = now
                                _patch_card(card_id, {"body": {
                                    "text": "".join(accumulated),
                                    "streaming": True,
                                    "kind": "streaming",
                                    "in_reply_to_card_id": source_card_id,
                                    "in_reply_to_author": author_name,
                                }})
            elif ev_type == "assistant":
                msg = ev.get("message") or {}
                for blk in msg.get("content", []):
                    if blk.get("type") == "text" and blk.get("text"):
                        accumulated = [blk["text"]]
        proc.wait(timeout=180)
    except Exception as e:
        print(f"[reply] stream err: {e}")
        try:
            proc.kill()
        except Exception:
            pass

    full = "".join(accumulated)
    visible = full
    kind = "answer"
    to_user: str | None = None
    to_team: str | None = None
    rationale: str | None = None
    m = _re.search(r"<route>\s*(\{[\s\S]*?\})\s*</route>", full)
    if m:
        try:
            r = json.loads(m.group(1))
            kind = (r.get("kind") or "answer").lower()
            to_user = r.get("to_user_email") or None
            t = r.get("to_team")
            to_team = t if t in {"backend", "ds", "ui", "devops"} else None
            rationale = r.get("rationale")
            visible = full[: m.start()].rstrip()
        except Exception:
            pass

    title = f"Agent → {to_user.split('@')[0]}: {kind}" if to_user else (
        f"Agent {kind}" if kind != "answer" else "Agent reply"
    )
    final_payload: dict = {
        "body": {
            "text": visible,
            "kind": kind,
            "rationale": rationale,
            "to_user": {"email": to_user} if to_user else None,
            "to_team": to_team,
            "in_reply_to_card_id": source_card_id,
            "in_reply_to_author": author_name,
            "streaming": False,
        },
        "status": "awaiting_answer" if kind == "question" else "info",
        "title": title,
    }
    if to_team:
        final_payload["team_id"] = to_team
    _patch_card(card_id, final_payload)
    print(f"[reply] card {card_id[:8]} done: kind={kind} to={to_user or to_team or '-'}")


@app.post("/chat")
async def chat(
    request: Request,
    x_teamhq_auth: str | None = Header(default=None, alias="X-TeamHQ-Auth"),
):
    _check_auth(x_teamhq_auth)
    body = await request.json()
    prompt: str = body.get("prompt") or ""
    system_prompt: str = body.get("system_prompt") or ""
    session_id: str | None = body.get("session_id")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt required")
    if not _has_claude():
        raise HTTPException(status_code=503, detail="claude CLI not on PATH on tunnel host")

    # NOTE: --bare strips auth too, so we leave hooks enabled and live with
    # the noisier startup events. Caller filters by event type.
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
    ]
    if system_prompt:
        cmd.extend(["--append-system-prompt", system_prompt])
    if session_id:
        cmd.extend(["--session-id", session_id])

    def event_stream():
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
        )
        try:
            assert proc.stdout
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                # Forward EVERY ndjson line as an SSE event so caller can pick
                # whatever subset of the protocol they care about.
                yield f"data: {line}\n\n"
            proc.wait(timeout=120)
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            try:
                if proc.poll() is None:
                    proc.kill()
            except Exception:
                pass
            yield "data: [[DONE]]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


if __name__ == "__main__":
    import uvicorn

    print(f"Tunnel listening on :{PORT}; secret = X-TeamHQ-Auth: {SECRET[:6]}…")
    print(f"Pair w/ ngrok: ngrok http {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
