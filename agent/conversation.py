"""Conversational agent loop.

When a user posts a message in a run feed, this module:
  1. Pulls the full card history for that run (trigger / questions / plans /
     prior messages / sandbox / PR / acceptance criteria).
  2. Asks Claude Sonnet 4.5 (via InsForge AI gateway) to classify the
     message and draft a reply.
  3. Returns a structured intent that the worker emits as one or more new
     cards (agent_reply, follow-up question, plan revision, etc.).

Role-tagging: Claude picks `to_user_email` and `to_team` so the right
persona's Approve / Answer / Reject buttons light up; everyone else sees
the card read-only with full context.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

import shutil
import subprocess
import urllib.request

from . import llm
from .insforge import _req as ifg


VALID_KINDS = {"answer", "question", "plan_revision", "comment", "noop"}


def _ask_claude_or_gateway(system_prompt: str, user_prompt: str) -> str:
    """Prefer the local `claude` CLI (same binary the PR opener uses) so
    chat responses stay in-context with code edits. Fall back to the
    InsForge AI gateway if claude isn't on PATH or errors out.
    """
    if shutil.which("claude"):
        try:
            res = subprocess.run(
                ["claude", "-p", user_prompt, "--append-system-prompt", system_prompt],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout
            print(f"[conversation] claude rc={res.returncode} stderr={res.stderr[:200]}")
        except Exception as e:
            print(f"[conversation] claude exec failed: {e}")

    # Fallback path — InsForge AI gateway w/ gpt-4o-mini.
    try:
        return llm.chat(
            messages=[{"role": "user", "content": user_prompt + "\n\nReturn ONE JSON object only — no fences."}],
            system_prompt=system_prompt,
            model="openai/gpt-4o-mini",
            max_tokens=400,
            temperature=0.2,
        ).get("text", "")
    except Exception as e:
        print(f"[conversation] gateway failed: {e}")
        return ""


def _stream_via_tunnel(
    *, tunnel_url: str, tunnel_secret: str,
    system_prompt: str, user_prompt: str,
    session_id: str | None, on_token,
):
    """POST to the tunnel's /chat SSE endpoint, parse the same NDJSON we'd
    get from local `claude -p`. Tunnel just proxies stdout.

    URL handling: caller may pass either the bare host (https://x.ngrok.app)
    or include the path (.../chat). We append /chat only if it's missing,
    so the env var can be either form.
    """
    url = tunnel_url.rstrip("/")
    if not url.endswith("/chat"):
        url = url + "/chat"

    payload = json.dumps({
        "prompt": user_prompt,
        "system_prompt": system_prompt,
        "session_id": session_id,
    }).encode()

    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-TeamHQ-Auth": tunnel_secret,
            "Accept": "text/event-stream",
        },
    )

    full_text_parts: list[str] = []
    new_session_id: str | None = None

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            buf = ""
            for raw in resp:
                buf += raw.decode("utf-8", errors="replace")
                while "\n\n" in buf:
                    chunk, buf = buf.split("\n\n", 1)
                    for line in chunk.splitlines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[[DONE]]":
                            return "".join(full_text_parts), new_session_id
                        try:
                            ev = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        sid = ev.get("session_id")
                        if sid:
                            new_session_id = sid
                        ev_type = ev.get("type")
                        if ev_type == "stream_event":
                            inner = ev.get("event") or {}
                            if inner.get("type") == "content_block_delta":
                                delta = inner.get("delta") or {}
                                if delta.get("type") == "text_delta":
                                    txt = delta.get("text") or ""
                                    if txt:
                                        full_text_parts.append(txt)
                                        try:
                                            on_token(txt)
                                        except Exception as e:
                                            print(f"[tunnel] on_token raised: {e}")
                        elif ev_type == "assistant":
                            msg = ev.get("message") or {}
                            for blk in msg.get("content", []):
                                if blk.get("type") == "text" and blk.get("text"):
                                    full_text_parts = [blk["text"]]
    except Exception as e:
        print(f"[tunnel] error: {e}")

    return "".join(full_text_parts), new_session_id


def stream_claude(
    *,
    system_prompt: str,
    user_prompt: str,
    session_id: str | None = None,
    on_token,
):
    """Spawn `claude -p` in stream-json mode, parse NDJSON live, fire
    on_token(text_chunk) for each text_delta event. Returns the final
    full text + claude's session_id (so caller can reuse the same
    session for multi-turn continuity).

    Dispatch order:
      1. Remote tunnel — if CLAUDE_TUNNEL_URL + TEAMHQ_TUNNEL_SECRET are set,
         POST to <url>/chat and consume the SSE stream. Lets Vercel-side
         workers reach the laptop's `claude` CLI through ngrok.
      2. Local subprocess — direct `claude -p` if the binary is on PATH.

    Bidirectional in spirit: stdout NDJSON = WebSocket-equivalent.
    Each text_delta arrives as Claude generates it.
    """
    tunnel_url = os.environ.get("CLAUDE_TUNNEL_URL")
    tunnel_secret = os.environ.get("TEAMHQ_TUNNEL_SECRET")
    if tunnel_url and tunnel_secret:
        return _stream_via_tunnel(
            tunnel_url=tunnel_url, tunnel_secret=tunnel_secret,
            system_prompt=system_prompt, user_prompt=user_prompt,
            session_id=session_id, on_token=on_token,
        )

    if not shutil.which("claude"):
        return "", None

    cmd = [
        "claude", "-p", user_prompt,
        "--append-system-prompt", system_prompt,
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",  # required when --output-format=stream-json --print
    ]
    if session_id:
        cmd.extend(["--session-id", session_id])

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
    )

    full_text_parts: list[str] = []
    new_session_id: str | None = None
    try:
        if proc.stdout is None:
            return "", None
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Capture session id from any event so caller can resume next turn.
            sid = ev.get("session_id")
            if sid:
                new_session_id = sid
            ev_type = ev.get("type")
            if ev_type == "stream_event":
                inner = ev.get("event") or {}
                if inner.get("type") == "content_block_delta":
                    delta = inner.get("delta") or {}
                    if delta.get("type") == "text_delta":
                        chunk = delta.get("text") or ""
                        if chunk:
                            full_text_parts.append(chunk)
                            try:
                                on_token(chunk)
                            except Exception as e:
                                print(f"[stream_claude] on_token raised: {e}")
            elif ev_type == "assistant":
                # Final assistant message — content array has full text.
                msg = ev.get("message") or {}
                for blk in msg.get("content", []):
                    if blk.get("type") == "text" and blk.get("text"):
                        # Prefer this canonical text over concat'd deltas.
                        full_text_parts = [blk["text"]]
        proc.wait(timeout=120)
    except subprocess.TimeoutExpired:
        proc.kill()
    except Exception as e:
        print(f"[stream_claude] error: {e}")
        proc.kill()

    return "".join(full_text_parts), new_session_id


@dataclass
class AgentResponse:
    kind: str
    text: str
    to_user_email: str | None
    to_team: str | None
    replan_card_id: str | None
    rationale: str | None


def _list_cards(run_id: str) -> list[dict]:
    rows = ifg("GET", f"/api/database/records/cards?run_id=eq.{run_id}&order=created_at.asc&limit=200")
    return rows if isinstance(rows, list) else []


def _format_history(cards: list[dict], message_id: str) -> str:
    lines: list[str] = []
    for c in cards:
        ct = c.get("card_type")
        body = c.get("body") or {}
        title = c.get("title") or ""
        team = c.get("team_id") or "-"
        author = body.get("author_name") or body.get("to_user", {}).get("name") or ""
        if ct == "trigger":
            lines.append(f"- TRIGGER: {body.get('trigger_source') or title}")
        elif ct == "acceptance_criteria":
            criteria = body.get("criteria") or []
            lines.append(f"- AC ({len(criteria)} items): {body.get('feature') or title}")
            for it in criteria[:5]:
                lines.append(f"    · {it.get('statement')}")
        elif ct == "question":
            asked_of = (body.get("to_user") or {}).get("email", "?")
            lines.append(f"- QUESTION→{asked_of} [{team}]: {body.get('text') or title}")
        elif ct == "team_plan":
            ans = (body.get("answer") or "")[:240]
            lines.append(f"- PLAN [{team}] status={c.get('status')}: {ans}")
        elif ct == "user_message":
            marker = " ←(this message)" if c.get("id") == message_id else ""
            lines.append(f"- MESSAGE from {author} [{team}]{marker}: {body.get('text','')}")
        elif ct == "agent_reply":
            lines.append(f"- AGENT REPLY [{team or 'all'}]: {body.get('text','')[:160]}")
        elif ct == "sandbox":
            lines.append(f"- SANDBOX: {body.get('python_version','ok')}")
        elif ct == "pr_opened":
            lines.append(f"- PR: {body.get('url','?')}")
    return "\n".join(lines)


_TEAM_TO_LEAD = {
    "backend": "sarah@teamhq.demo",
    "ds": "iris@teamhq.demo",
    "ui": "alice@teamhq.demo",
    "devops": "grace@teamhq.demo",
}


def respond_to_message(run_id: str, message_card: dict) -> AgentResponse:
    """Hand the full run history + the new message to Claude. Return an
    AgentResponse describing what card(s) the worker should emit next."""
    cards = _list_cards(run_id)
    if not cards:
        return AgentResponse(
            kind="noop", text="(no run context found)", to_user_email=None,
            to_team=None, replan_card_id=None, rationale="empty run",
        )

    history = _format_history(cards, message_card.get("id", ""))
    message_text = (message_card.get("body") or {}).get("text", "")
    author = (message_card.get("body") or {}).get("author_name", "someone")
    author_team = (message_card.get("body") or {}).get("author_team", "?")

    sys_prompt = (
        "You are TeamHQ's conversational engineering agent. Output ONE single "
        "JSON object exactly matching this schema. NO prose before or after. "
        "NO markdown fences. NO additional keys.\n\n"
        "Schema (keys in this exact order):\n"
        "{\n"
        '  "kind": "answer" | "question" | "plan_revision" | "comment" | "noop",\n'
        '  "text": "<your reply, written as you addressing the team — one short paragraph, max 80 words>",\n'
        '  "to_user_email": "<persona email if a specific human should act on this, else null>",\n'
        '  "to_team": "backend" | "ds" | "ui" | "devops" | null,\n'
        '  "replan_card_id": <card uuid string if a team_plan needs revision, else null>,\n'
        '  "rationale": "<one short sentence on WHY you chose this kind/recipient>"\n'
        "}\n\n"
        "Kind selection:\n"
        "- `answer`: respond directly to the question/observation in `text`.\n"
        "- `question`: route a follow-up to a SINGLE persona — set `to_user_email`.\n"
        "- `plan_revision`: an existing team_plan now needs updating — set `replan_card_id`.\n"
        "- `comment`: brief acknowledgement only.\n"
        "- `noop`: nothing useful to add (avoid unless message is empty/spam).\n\n"
        "Personas: backend=sarah@teamhq.demo, ds=iris@teamhq.demo, "
        "ui=alice@teamhq.demo, devops=grace@teamhq.demo, architect=dan@teamhq.demo, pm=frank@teamhq.demo.\n\n"
        "Example output (just the JSON, copied to clipboard exactly):\n"
        '{"kind":"question","text":"Grace — does the SSE long-lived connection need a probe-timeout bump in our K8s manifest? Current is 5s.","to_user_email":"grace@teamhq.demo","to_team":"devops","replan_card_id":null,"rationale":"DevOps owns the readiness probe and Sarah explicitly asked to confirm with Grace"}'
    )

    user_prompt = (
        f"# Run history (oldest first)\n{history}\n\n"
        f"# New message just posted by {author} ({author_team})\n"
        f"\"{message_text}\"\n\n"
        f"Respond with the JSON now."
    )

    text = _ask_claude_or_gateway(sys_prompt, user_prompt)
    if not text:
        return AgentResponse(
            kind="comment", text="(agent unreachable)",
            to_user_email=None, to_team=None, replan_card_id=None,
            rationale="llm exception",
        )

    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)

    parsed: dict[str, Any] | None = None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = None
    if not isinstance(parsed, dict):
        return AgentResponse(
            kind="comment", text=text[:400] or "(no parse)",
            to_user_email=None, to_team=None, replan_card_id=None,
            rationale="llm returned unparseable",
        )

    kind = (parsed.get("kind") or "comment").lower()
    if kind not in VALID_KINDS:
        kind = "comment"
    to_team = parsed.get("to_team")
    to_user = parsed.get("to_user_email")
    # If team given but not user, infer the team lead.
    if to_team and not to_user and to_team in _TEAM_TO_LEAD:
        to_user = _TEAM_TO_LEAD[to_team]
    return AgentResponse(
        kind=kind,
        text=str(parsed.get("text") or "").strip()[:1200],
        to_user_email=to_user,
        to_team=to_team if to_team in {"backend", "ds", "ui", "devops"} else None,
        replan_card_id=parsed.get("replan_card_id"),
        rationale=str(parsed.get("rationale") or "")[:300] or None,
    )
