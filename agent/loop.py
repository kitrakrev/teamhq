"""Agent loop V1.

Stages (each emits a card to the InsForge `cards` table; UI subscribes):
    1. Trigger card
    2. Per-team plan cards (Hyperspell `gpt-oss-120b`, scoped to team collection)
    3. World context card (Nia)
    4. Sandbox card (Tensorlake clone + run command + capture)
    5. Test result card (pytest in sandbox)
    6. PR opened card (gh CLI as kitrakrev)
    7. Run finished

Multi-team is built in from V1: we map the trigger's affected paths to the
teams that own them via CODEOWNERS, then synthesize one plan per team.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

from . import hyperspell, sandbox
from .cards import emit
from .insforge import insert, update


@dataclass
class TriggerSpec:
    repo: str                           # "kitrakrev/teamhq-hero"
    trigger_type: str                   # "manual" | "cron" | "webhook"
    trigger_source: str                 # "openai==1.0.0 release"
    affected_paths: list[str] = field(default_factory=list)


# Team mapping. V2 will read this from the repo's CODEOWNERS instead.
PATH_TO_TEAM = [
    ("src/api/", "backend"),
    ("src/ml/", "ds"),
    ("src/infra/", "devops"),
    ("frontend/", "ui"),
    # legacy single-team layout
    ("src/", "backend"),
]


def teams_for_paths(paths: list[str]) -> dict[str, list[str]]:
    """Group affected file paths by owning team."""
    out: dict[str, list[str]] = {}
    for p in paths:
        for prefix, team in PATH_TO_TEAM:
            if p.startswith(prefix):
                out.setdefault(team, []).append(p)
                break
    return out


def question_for(*, trigger: TriggerSpec, team: str, files: list[str]) -> str:
    return (
        f"Trigger: {trigger.trigger_source}.\n"
        f"Files in our team's domain: {', '.join(files)}\n"
        f"Given our team's conventions documented in Slack and Notion, "
        f"draft a migration plan that respects them. Cite the team artifacts "
        f"that justify each decision."
    )


def start_run(trigger: TriggerSpec) -> dict[str, Any]:
    row = insert(
        "runs",
        {
            "repo": trigger.repo,
            "trigger_type": trigger.trigger_type,
            "trigger_source": trigger.trigger_source,
            "status": "starting",
            "started_at": _now_iso(),
        },
    )
    return row


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000+00:00", time.gmtime())


def run(trigger: TriggerSpec) -> dict[str, Any]:
    """Execute V1 loop synchronously. Returns the final run row.

    Each phase logs a card to InsForge — the UI streams them via realtime.
    """
    run_row = start_run(trigger)
    run_id = run_row.get("id") or _lookup_latest_run_id(trigger)
    print(f"[loop] run started: {run_id}")

    emit(
        run_id=run_id,
        card_type="trigger",
        title=f"Trigger: {trigger.trigger_source}",
        body={
            "repo": trigger.repo,
            "trigger_type": trigger.trigger_type,
            "trigger_source": trigger.trigger_source,
            "affected_paths": trigger.affected_paths,
        },
        status="info",
    )

    teams = teams_for_paths(trigger.affected_paths)
    print(f"[loop] team mapping: { {t: len(fs) for t, fs in teams.items()} }")

    team_plans: dict[str, dict[str, Any]] = {}
    for team, files in teams.items():
        question = question_for(trigger=trigger, team=team, files=files)
        plan = hyperspell.ask(team=team, question=question, max_results=5)
        team_plans[team] = plan
        emit(
            run_id=run_id,
            card_type="team_plan",
            title=f"{team.upper()} team plan",
            team_id=team,
            body={
                "answer": plan["answer"],
                "model": plan["model"],
                "documents": plan["documents"],
                "files": files,
                "question": question,
            },
            visibility={"read": ["*"], "act": [f"team:{team}"]},
            status="planned" if plan["answer"] else "no_brain",
        )
        print(f"[loop] team_plan {team}: {len(plan['documents'])} citations")

    sandbox_status = _run_sandbox(run_id=run_id, trigger=trigger)

    pr_url = _open_pr_stub(run_id=run_id, trigger=trigger, team_plans=team_plans)

    final = update(
        "runs",
        run_id,
        {
            "status": "completed",
            "finished_at": _now_iso(),
            "pr_url": pr_url or "",
        },
    )
    print(f"[loop] run done: {run_id}")
    return final


def _lookup_latest_run_id(trigger: TriggerSpec) -> str:
    """Fallback path: InsForge sometimes returns [] from POST /records.
    Look up the run we just inserted by repo + status."""
    from .insforge import list_rows

    rows = list_rows("runs", limit=10)
    for r in rows:
        if r.get("repo") == trigger.repo and r.get("status") == "starting":
            return r["id"]
    raise RuntimeError("could not locate the run we just inserted")


def _run_sandbox(*, run_id: str, trigger: TriggerSpec) -> dict[str, Any]:
    """Bring up a Tensorlake sandbox, prove we can run code in it, log a card.

    V1 doesn't apply edits or run pytest yet — that's V2 once the codemod is
    written. The card here is the proof-of-life that compute is wired.
    """
    sb = sandbox.create()
    info: dict[str, Any] = {"sandbox": "ephemeral"}
    try:
        ver = sandbox.run(sb, "python", ["--version"])
        info["python_version"] = ver.stdout.strip() or ver.stderr.strip()
        # V2 will: clone, install, codemod, pytest. V1 stops at proof-of-life.
        emit(
            run_id=run_id,
            card_type="sandbox",
            title="Tensorlake sandbox up",
            body=info,
            status="ok",
        )
        print(f"[loop] sandbox ok: {info['python_version']}")
    finally:
        try:
            sb.terminate()
        except Exception as e:
            info["terminate_error"] = str(e)
    return info


def _open_pr_stub(
    *, run_id: str, trigger: TriggerSpec, team_plans: dict[str, dict[str, Any]]
) -> str | None:
    """V1: log a `pr_pending` card with the plan body, no real PR yet.

    V2 will:
      - check out a branch in the sandbox
      - apply codemod
      - push branch
      - call agent.executor.open_pr to create the real PR
    """
    body = {
        "repo": trigger.repo,
        "trigger": trigger.trigger_source,
        "team_plans": {
            team: {
                "answer": plan["answer"],
                "citations": [d["title"] for d in plan["documents"]],
            }
            for team, plan in team_plans.items()
        },
    }
    emit(
        run_id=run_id,
        card_type="pr_pending",
        title="PR proposal ready (V1 stub)",
        body=body,
        status="pending",
    )
    return None
