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
from agent.conversation import respond_to_message  # noqa: E402
from agent.insforge import _req as ifg  # noqa: E402


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
                    resp = respond_to_message(run_id, msg)
                    print(f"[worker] msg={msg['id'][:8]} → {resp.kind} (to {resp.to_user_email or resp.to_team or '-'})")
                    if resp.kind != "noop":
                        _emit_reply(run_id=run_id, org_id=org_id, project_id=project_id,
                                    response=resp, source_msg=msg)
                except Exception as e:
                    print(f"[worker] respond_to_message failed for {msg.get('id')}: {e}")
                finally:
                    _mark_handled(msg.get("id", ""))
        except Exception as e:
            print(f"[worker] poll error: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
