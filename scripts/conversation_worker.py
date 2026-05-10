"""Long-running poll loop that turns user_message cards into agent_reply cards.

Loop:
  1. Every 5 seconds, fetch user_message cards w/ status='info' (unprocessed).
  2. For each, call agent.conversation.respond_to_message → emit one new card
     (agent_reply or follow-up question) into the same run.
  3. PATCH the source message's status to 'handled' so we don't re-process.

Usage:
    python scripts/conversation_worker.py
    # or in dev: pm2 / nohup; production: a single Tensorlake background task.
"""
from __future__ import annotations

import os
import sys
import time
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

from agent.cards import emit  # noqa: E402
from agent.conversation import respond_to_message, stream_claude  # noqa: E402
from agent.insforge import _req as ifg  # noqa: E402

# Per-run Claude session id, so multi-turn chat keeps context.
RUN_SESSION_IDS: dict[str, str] = {}


POLL_SECONDS = float(os.environ.get("TEAMHQ_WORKER_POLL_SECONDS", "5"))


def _fetch_unhandled() -> list[dict]:
    rows = ifg(
        "GET",
        "/api/database/records/cards?card_type=eq.user_message&status=eq.info"
        "&order=created_at.asc&limit=20",
    )
    return rows if isinstance(rows, list) else []


def _mark_handled(card_id: str) -> None:
    ifg("PATCH", f"/api/database/records/cards?id=eq.{card_id}", {"status": "handled"})


def _patch_card(card_id: str, body_patch: dict, status: str | None = None, title: str | None = None) -> None:
    payload: dict = {}
    if body_patch is not None:
        payload["body"] = body_patch
    if status is not None:
        payload["status"] = status
    if title is not None:
        payload["title"] = title
    if not payload:
        return
    ifg("PATCH", f"/api/database/records/cards?id=eq.{card_id}", payload)


def _stream_into_card(*, run_id: str, org_id: str, project_id: str | None, source_msg: dict) -> None:
    """Insert a placeholder agent_reply card, stream Claude's tokens into it
    live, then finalise routing/kind metadata once stream completes."""
    from agent.conversation import _list_cards, _format_history  # noqa: WPS433

    cards = _list_cards(run_id)
    history = _format_history(cards, source_msg.get("id", ""))
    body_msg = source_msg.get("body") or {}
    text = body_msg.get("text", "")
    author = body_msg.get("author_name", "team member")

    sys_prompt = (
        "You are TeamHQ's conversational engineering agent. Reply to the team member's "
        "message in plain prose (one short paragraph). At the very end of your reply, on a new line, "
        "append a JSON tag of the form: <route>{\"kind\":\"answer|question|plan_revision|comment|noop\","
        "\"to_user_email\":\"<email or null>\",\"to_team\":\"backend|ds|ui|devops or null\","
        "\"replan_card_id\":<uuid or null>,\"rationale\":\"<one sentence>\"}</route>. "
        "Personas: backend=sarah@teamhq.demo, ds=iris@teamhq.demo, ui=alice@teamhq.demo, "
        "devops=grace@teamhq.demo, architect=dan@teamhq.demo, pm=frank@teamhq.demo."
    )
    user_prompt = (
        f"# Run history (oldest first)\n{history}\n\n"
        f"# New message from {author}\n{text!r}\n\n"
        "Respond now. Stream your reply, then end with the <route>...</route> JSON tag."
    )

    # 1. Insert placeholder agent_reply card so the UI shows it immediately.
    placeholder = emit(
        run_id=run_id, org_id=org_id, project_id=project_id,
        card_type="agent_reply",
        title=f"Agent thinking…",
        team_id=None,
        body={
            "text": "",
            "in_reply_to_card_id": source_msg.get("id"),
            "in_reply_to_author": author,
            "kind": "streaming",
            "streaming": True,
        },
        status="streaming",
    )
    card_id = placeholder.get("id") if isinstance(placeholder, dict) else None
    if not card_id:
        print("[worker] failed to create placeholder card; aborting stream")
        return

    print(f"[worker] streaming into card {card_id[:8]}…")

    # 2. Stream tokens. Throttle PATCHes to ~3/sec so InsForge isn't pummelled.
    accumulated: list[str] = []
    last_patch_at = [0.0]
    PATCH_INTERVAL = 0.35

    def on_token(chunk: str) -> None:
        accumulated.append(chunk)
        now = time.time()
        if now - last_patch_at[0] >= PATCH_INTERVAL:
            last_patch_at[0] = now
            _patch_card(card_id, {
                "text": "".join(accumulated),
                "in_reply_to_card_id": source_msg.get("id"),
                "in_reply_to_author": author,
                "kind": "streaming",
                "streaming": True,
            })

    session_id = RUN_SESSION_IDS.get(run_id)
    full_text, new_sid = stream_claude(
        system_prompt=sys_prompt,
        user_prompt=user_prompt,
        session_id=session_id,
        on_token=on_token,
    )
    if new_sid and new_sid != session_id:
        RUN_SESSION_IDS[run_id] = new_sid

    # 3. Parse the trailing <route>...</route> tag for routing metadata.
    import re as _re
    route: dict = {}
    visible_text = full_text
    m = _re.search(r"<route>\s*(\{[\s\S]*?\})\s*</route>", full_text)
    if m:
        try:
            route = __import__("json").loads(m.group(1))
            visible_text = full_text[: m.start()].rstrip()
        except Exception:
            pass

    kind = (route.get("kind") or "answer").lower()
    if kind not in {"answer", "question", "plan_revision", "comment", "noop"}:
        kind = "answer"
    to_user = route.get("to_user_email")
    to_team = route.get("to_team")
    if to_team not in {"backend", "ds", "ui", "devops"}:
        to_team = None

    final_title = "Agent reply" if kind == "answer" else f"Agent: {kind}"
    if to_user:
        final_title = f"Agent → {to_user.split('@')[0]}: {kind}"

    _patch_card(card_id, {
        "text": visible_text or full_text,
        "kind": kind,
        "rationale": route.get("rationale"),
        "to_user": {"email": to_user} if to_user else None,
        "to_team": to_team,
        "in_reply_to_card_id": source_msg.get("id"),
        "in_reply_to_author": author,
        "streaming": False,
    }, status="info" if kind in {"answer", "comment"} else "awaiting_answer", title=final_title)
    # Also set team_id (top-level column) if we have one.
    if to_team:
        ifg("PATCH", f"/api/database/records/cards?id=eq.{card_id}", {"team_id": to_team})

    print(f"[worker] streamed card {card_id[:8]} kind={kind} to={to_user or to_team or '-'}")


def _emit_reply(*, run_id: str, org_id: str, project_id: str | None, response, source_msg: dict) -> None:
    """Materialise the agent's intent as a fresh card."""
    body: dict = {
        "text": response.text,
        "rationale": response.rationale,
        "in_reply_to_card_id": source_msg.get("id"),
        "in_reply_to_author": (source_msg.get("body") or {}).get("author_name"),
    }
    if response.to_user_email:
        body["to_user"] = {"email": response.to_user_email}
    if response.to_team:
        body["to_team"] = response.to_team
    if response.replan_card_id:
        body["replan_card_id"] = response.replan_card_id

    if response.kind == "question":
        title = f"Agent → {response.to_user_email or response.to_team or 'team'}: {response.text[:60]}"
        emit(
            run_id=run_id, org_id=org_id, project_id=project_id,
            card_type="agent_reply", title=title, team_id=response.to_team,
            body={**body, "kind": "question", "free_text_ok": True},
            visibility={"read": ["*"], "act": [f"user:{response.to_user_email or ''}"]},
            status="awaiting_answer",
        )
    elif response.kind == "plan_revision":
        emit(
            run_id=run_id, org_id=org_id, project_id=project_id,
            card_type="agent_reply", title=f"Agent: plan revision proposed for {response.to_team or 'team'}",
            team_id=response.to_team,
            body={**body, "kind": "plan_revision"},
            visibility={"read": ["*"], "act": [f"team:{response.to_team or ''}"]},
            status="awaiting_approval",
        )
    elif response.kind == "answer":
        emit(
            run_id=run_id, org_id=org_id, project_id=project_id,
            card_type="agent_reply", title=f"Agent reply to {(source_msg.get('body') or {}).get('author_name','team')}",
            team_id=response.to_team,
            body={**body, "kind": "answer"},
            status="info",
        )
    elif response.kind == "comment":
        emit(
            run_id=run_id, org_id=org_id, project_id=project_id,
            card_type="agent_reply", title="Agent: noted",
            team_id=response.to_team,
            body={**body, "kind": "comment"},
            status="info",
        )
    # noop: emit nothing


def main() -> int:
    print(f"[worker] polling every {POLL_SECONDS}s")
    while True:
        try:
            queue = _fetch_unhandled()
            if queue:
                print(f"[worker] handling {len(queue)} message(s)")
            for msg in queue:
                run_id = msg.get("run_id")
                org_id = msg.get("org_id")
                project_id = msg.get("project_id")
                if not run_id or not org_id:
                    _mark_handled(msg.get("id", ""))
                    continue
                try:
                    # Streaming path — token-by-token PATCHes into a placeholder card.
                    _stream_into_card(run_id=run_id, org_id=org_id,
                                      project_id=project_id, source_msg=msg)
                except Exception as e:
                    print(f"[worker] stream failed for {msg.get('id')}: {e}; falling back to non-streaming")
                    try:
                        resp = respond_to_message(run_id, msg)
                        if resp.kind != "noop":
                            _emit_reply(run_id=run_id, org_id=org_id, project_id=project_id,
                                        response=resp, source_msg=msg)
                    except Exception as e2:
                        print(f"[worker] fallback also failed: {e2}")
                finally:
                    _mark_handled(msg.get("id", ""))
        except Exception as e:
            print(f"[worker] poll error: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
