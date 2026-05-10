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


def _emit_card(payload: dict) -> dict:
    """Insert a new card via InsForge."""
    import urllib.request
    url = os.environ["INSFORGE_PROJECT_URL"] + "/api/database/records/cards"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={
            "x-api-key": os.environ["INSFORGE_ACCESS_API_KEY"],
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        body = urllib.request.urlopen(req, timeout=15).read().decode()
        rows = json.loads(body) if body else []
        return rows[0] if isinstance(rows, list) and rows else {}
    except Exception as e:
        print(f"[reply] emit err: {e}")
        return {}


def _get_run(run_id: str) -> dict:
    import urllib.request
    url = os.environ["INSFORGE_PROJECT_URL"] + f"/api/database/records/runs?id=eq.{run_id}"
    req = urllib.request.Request(url, headers={"x-api-key": os.environ["INSFORGE_ACCESS_API_KEY"]})
    try:
        rows = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
        return rows[0] if rows else {}
    except Exception as e:
        print(f"[reply] get_run err: {e}")
        return {}


def _execute_code_action(*, run_id: str, org_id: str, project_id: str | None,
                        prompt: str, source_card_id: str | None, author_name: str | None) -> None:
    """Clone the run's repo, hand it to Claude Code, push a branch, open PR.

    Mirrors agent/loop.py::_open_pr but driven by a single chat message
    instead of a multi-team plan.
    """
    import shutil as _shutil
    import subprocess as _sp
    import tempfile
    import time as _t
    from pathlib import Path

    run = _get_run(run_id)
    repo = run.get("repo")
    if not repo:
        _emit_card({
            "org_id": org_id, "project_id": project_id, "run_id": run_id,
            "card_type": "agent_reply",
            "title": "Agent action skipped",
            "body": {"text": "(no repo on this run; action skipped)", "kind": "comment",
                     "in_reply_to_card_id": source_card_id},
            "status": "info",
        })
        return

    # Announce start.
    start_card = _emit_card({
        "org_id": org_id, "project_id": project_id, "run_id": run_id,
        "card_type": "agent_reply",
        "title": f"Agent acting on {repo} — Claude Code editing",
        "team_id": None,
        "body": {
            "text": f"Cloning {repo}, running `claude -p` against the repo, opening a draft PR.",
            "kind": "action",
            "streaming": True,
            "in_reply_to_card_id": source_card_id,
            "in_reply_to_author": author_name,
            "repo": repo,
        },
        "status": "streaming",
    })
    start_id = start_card.get("id")

    branch = f"teamhq/chat-{run_id[:8]}-{int(_t.time())}"
    pr_title = f"TeamHQ chat: {prompt[:60]}"

    if not _shutil.which("claude") or not _shutil.which("git") or not _shutil.which("gh"):
        if start_id:
            _patch_card(start_id, {"body": {"text": "(claude/git/gh missing on tunnel host)", "streaming": False}, "status": "info"})
        return

    try:
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp) / "repo"
            _sp.run(["git", "clone", "--depth", "1", f"https://github.com/{repo}.git", str(wd)],
                    check=True, capture_output=True)
            _sp.run(["git", "-C", str(wd), "checkout", "-b", branch], check=True, capture_output=True)

            # Hand the prompt to Claude Code in the cloned repo.
            claude_prompt = (
                f"You are inside a cloned copy of {repo} on branch {branch}. "
                f"A team member just asked: {prompt!r}\n\n"
                "Make the smallest concrete code change that addresses the request. "
                "Edit files directly. Don't try to land a huge change — focus on a "
                "reviewable first step. After editing, write a one-line commit message."
            )
            res = _sp.run(
                ["claude", "-p", claude_prompt, "--add-dir", str(wd), "--dangerously-skip-permissions"],
                cwd=str(wd), capture_output=True, text=True, timeout=600,
            )
            print(f"[action] claude rc={res.returncode}, stdout={len(res.stdout)} chars")

            diff = _sp.run(["git", "-C", str(wd), "status", "--porcelain"], capture_output=True, text=True)
            if not diff.stdout.strip():
                if start_id:
                    _patch_card(start_id, {"body": {
                        "text": "Claude ran but made no changes (no diff to push).",
                        "kind": "comment", "streaming": False,
                    }, "status": "info"})
                return

            _sp.run(["git", "-C", str(wd), "add", "-A"], check=True, capture_output=True)
            _sp.run(
                ["git", "-C", str(wd),
                 "-c", "user.name=kitrakrev",
                 "-c", "user.email=kitrakrev@users.noreply.github.com",
                 "commit", "-q", "-m", f"teamhq chat: {prompt[:80]}"],
                check=True, capture_output=True,
            )
            _sp.run(["git", "-C", str(wd), "push", "-u", "origin", branch], check=True, capture_output=True)

            pr_body = (
                f"## TeamHQ chat-driven change\n\n"
                f"**Asker**: {author_name or 'team member'}\n\n"
                f"**Prompt**: {prompt}\n\n"
                f"**Branch**: `{branch}`\n\n---\n"
                f"Claude Code (`claude -p`) edited the repo in a tunnel-hosted sandbox. "
                f"This PR is the smallest reviewable first step."
            )
            pr_res = _sp.run(
                ["gh", "pr", "create", "--repo", repo, "--head", branch, "--base", "main",
                 "--title", pr_title, "--body", pr_body, "--draft"],
                check=True, capture_output=True, text=True,
            )
            url = pr_res.stdout.strip().splitlines()[-1]

            # Finalise the action card.
            if start_id:
                _patch_card(start_id, {
                    "body": {
                        "text": f"Edited {repo}, pushed `{branch}`, opened draft PR.",
                        "kind": "action",
                        "streaming": False,
                        "url": url,
                        "branch": branch,
                        "repo": repo,
                    },
                    "status": "info",
                    "title": f"Agent acted: {url.split('/')[-1] if url else 'PR opened'}",
                })
            # Emit a separate pr_opened card so the existing UI rendering kicks in.
            _emit_card({
                "org_id": org_id, "project_id": project_id, "run_id": run_id,
                "card_type": "pr_opened",
                "title": f"PR opened — {url.split('/')[-1]}",
                "body": {"url": url, "repo": repo, "branch": branch, "title": pr_title},
                "status": "opened",
            })
            print(f"[action] PR opened: {url}")
    except _sp.CalledProcessError as e:
        msg = (e.stderr or b"").decode(errors="replace")[-600:]
        print(f"[action] failed: {msg}")
        if start_id:
            _patch_card(start_id, {"body": {
                "text": f"(action failed) {msg}",
                "kind": "comment", "streaming": False,
            }, "status": "info"})
    except Exception as e:
        print(f"[action] error: {e}")
        if start_id:
            _patch_card(start_id, {"body": {
                "text": f"(action error) {e}",
                "kind": "comment", "streaming": False,
            }, "status": "info"})


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

    # If Claude classified the message as an `action`, run the code-action
    # pipeline next: clone repo → claude --add-dir → push → open PR.
    if kind == "action":
        run_id = body.get("run_id")
        org_id = body.get("org_id")
        project_id = body.get("project_id")
        action_prompt = body.get("user_text") or visible or ""
        if run_id and org_id:
            _execute_code_action(
                run_id=run_id, org_id=org_id, project_id=project_id,
                prompt=action_prompt, source_card_id=source_card_id,
                author_name=author_name,
            )


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
