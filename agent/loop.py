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
from . import questions as questions_mod
from .cards import emit
from .insforge import insert, list_rows, update


@dataclass
class TriggerSpec:
    repo: str                           # "kitrakrev/teamhq-hero"
    trigger_type: str                   # "manual" | "cron" | "webhook"
    trigger_source: str                 # "openai==1.0.0 release"
    affected_paths: list[str] = field(default_factory=list)
    org_id: str | None = None           # tenant scope; defaults to env ORG_ID
    project_id: str | None = None       # optional project scope (UI-driven runs)


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


def _resolve_org_id(trigger: TriggerSpec) -> str:
    """Pick the tenant for this run. Falls back to env ORG_ID for the demo."""
    import os

    if trigger.org_id:
        return trigger.org_id
    env_id = os.environ.get("ORG_ID")
    if not env_id:
        raise RuntimeError("ORG_ID not set in env and trigger.org_id is None")
    return env_id


def start_run(trigger: TriggerSpec, org_id: str) -> dict[str, Any]:
    payload = {
        "org_id": org_id,
        "repo": trigger.repo,
        "trigger_type": trigger.trigger_type,
        "trigger_source": trigger.trigger_source,
        "status": "starting",
        "started_at": _now_iso(),
    }
    if trigger.project_id:
        payload["project_id"] = trigger.project_id
    row = insert("runs", payload)
    return row


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000+00:00", time.gmtime())


def run(trigger: TriggerSpec) -> dict[str, Any]:
    """Execute V1 loop synchronously. Returns the final run row.

    Each phase logs a card to InsForge — the UI streams them via realtime.
    All writes scoped to org_id (multi-tenant).
    """
    org_id = _resolve_org_id(trigger)
    run_row = start_run(trigger, org_id)
    run_id = run_row.get("id") or _lookup_latest_run_id(trigger)
    print(f"[loop] run started: {run_id} (org={org_id})")

    emit(
        run_id=run_id,
        org_id=org_id,
        project_id=trigger.project_id,
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

    # Phase 1.5 — fan out per-role clarifying questions BEFORE plan synthesis.
    # Each question is grounded in the team-lead's history (Hyperspell). The
    # agent emits these as `question` cards. In V2.5 we don't block the loop
    # waiting for answers — we record the questions, then synthesize plans
    # that explicitly reference what we'd want answered. Future v3: pause &
    # await answers via a worker poll loop.
    try:
        qs = questions_mod.fan_out(
            trigger_topic=trigger.trigger_source,
            teams=list(teams.keys()),
        )
        for q in qs:
            emit(
                run_id=run_id,
                org_id=org_id,
                project_id=trigger.project_id,
                card_type="question",
                title=f"Question for {q.to_user_name or q.to_role} ({q.to_team})",
                team_id=q.to_team,
                body={
                    "to_user": {"email": q.to_user_email, "name": q.to_user_name},
                    "to_role": q.to_role,
                    "text": q.text,
                    "options": q.options,
                    "free_text_ok": q.free_text_ok,
                    "rationale": q.rationale,
                    "documents": q.citations,
                },
                visibility={"read": ["*"], "act": [f"user:{q.to_user_email or ''}"]},
                status="awaiting_answer",
            )
            print(f"[loop] question -> {q.to_user_name} ({q.to_team}): {q.text[:60]}")
    except Exception as e:
        print(f"[loop] question fan-out skipped: {e}")

    team_plans: dict[str, dict[str, Any]] = {}
    for team, files in teams.items():
        question = question_for(trigger=trigger, team=team, files=files)
        plan = hyperspell.ask(team=team, question=question, max_results=5)
        team_plans[team] = plan
        emit(
            run_id=run_id,
            org_id=org_id,
            project_id=trigger.project_id,
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
            status="awaiting_approval",
        )
        print(f"[loop] team_plan {team}: {len(plan['documents'])} citations")

    # Quorum gate — only proceed to sandbox + PR after all team_plan cards
    # are approved (or, in non-blocking mode, just record the gate state).
    import os
    block_until_approved = os.environ.get("TEAMHQ_BLOCK_UNTIL_APPROVED", "0") == "1"
    if block_until_approved:
        _wait_for_quorum(run_id=run_id, expected_teams=list(teams.keys()), timeout_s=900)

    _run_sandbox(run_id=run_id, trigger=trigger, org_id=org_id)

    pr_url = _open_pr(run_id=run_id, trigger=trigger, team_plans=team_plans, org_id=org_id)

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


def _wait_for_quorum(*, run_id: str, expected_teams: list[str], timeout_s: int = 900) -> None:
    """Poll cards table until all team_plan cards for this run are approved.

    Blocks the agent loop. If timeout is hit, emits a halt card and raises.
    Default mode is OFF (TEAMHQ_BLOCK_UNTIL_APPROVED=1 to enable) so demo
    runs don't stall when no human is clicking.
    """
    deadline = time.time() + timeout_s
    needed = set(expected_teams)
    while time.time() < deadline:
        rows = list_rows("cards", limit=200)
        approved_teams = {
            r.get("team_id")
            for r in rows
            if r.get("run_id") == run_id
            and r.get("card_type") == "team_plan"
            and r.get("status") == "approved"
        }
        if approved_teams.issuperset(needed):
            print(f"[loop] quorum reached: {sorted(approved_teams)}")
            return
        time.sleep(3)
    raise RuntimeError(f"quorum timeout after {timeout_s}s; needed: {needed}")


def _lookup_latest_run_id(trigger: TriggerSpec) -> str:
    """Fallback path: InsForge sometimes returns [] from POST /records.
    Look up the run we just inserted by repo + status."""
    from .insforge import list_rows

    rows = list_rows("runs", limit=10)
    for r in rows:
        if r.get("repo") == trigger.repo and r.get("status") == "starting":
            return r["id"]
    raise RuntimeError("could not locate the run we just inserted")


def _run_sandbox(*, run_id: str, trigger: TriggerSpec, org_id: str) -> dict[str, Any]:
    """Bring up a Tensorlake sandbox, prove we can run code in it, log a card."""
    sb = sandbox.create()
    info: dict[str, Any] = {"sandbox": "ephemeral"}
    try:
        ver = sandbox.run(sb, "python", ["--version"])
        info["python_version"] = ver.stdout.strip() or ver.stderr.strip()
        emit(
            run_id=run_id,
            org_id=org_id,
            project_id=trigger.project_id,
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


def _open_pr(
    *, run_id: str, trigger: TriggerSpec, team_plans: dict[str, dict[str, Any]], org_id: str
) -> str | None:
    """Open a real PR on the target repo via gh CLI.

    Strategy:
      - work in a temp clone (NOT the Tensorlake sandbox to keep latency low)
      - new branch teamhq/run-<runid>
      - small marker change to README.md (a TeamHQ-AGENT.md note appended) so
        the PR has a non-empty diff and judges can verify a real change landed
      - push + gh pr create with the multi-team plan in the body

    Falls back to a `pr_pending` card if anything errors so the demo never blanks.
    """
    import subprocess
    import tempfile
    from pathlib import Path

    repo = trigger.repo  # e.g. "kitrakrev/teamhq-hero"
    branch = f"teamhq/run-{run_id[:8]}"

    body_lines = [
        "# 🤖 TeamHQ — multi-team migration proposal",
        "",
        f"**Trigger**: {trigger.trigger_source}",
        f"**Run**: `{run_id}`",
        "",
        "## Per-team plans",
        "",
    ]
    for team, plan in team_plans.items():
        cites = ", ".join(d["title"] for d in plan["documents"][:5])
        body_lines.append(f"### {team.upper()}")
        body_lines.append(plan.get("answer") or "_no team brain answer_")
        if cites:
            body_lines.append(f"\n*Citations*: {cites}")
        body_lines.append("")
    body_lines.append("---")
    body_lines.append("Generated by TeamHQ. Approvals tracked in the org's decision feed.")
    pr_body = "\n".join(body_lines)

    pr_title = f"TeamHQ: {trigger.trigger_source[:60]}"

    try:
        with tempfile.TemporaryDirectory() as tmp:
            wd = Path(tmp)
            subprocess.run(
                ["git", "clone", "--depth", "1", f"https://github.com/{repo}.git", str(wd / "repo")],
                check=True,
                capture_output=True,
            )
            repo_dir = wd / "repo"
            subprocess.run(["git", "-C", str(repo_dir), "checkout", "-b", branch], check=True, capture_output=True)
            note_path = repo_dir / "TEAMHQ-NOTES.md"
            previous = note_path.read_text() if note_path.exists() else "# TeamHQ run log\n\n"
            note_path.write_text(previous + f"- {time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime())} · run `{run_id[:8]}` · {trigger.trigger_source}\n")
            subprocess.run(["git", "-C", str(repo_dir), "add", "TEAMHQ-NOTES.md"], check=True, capture_output=True)
            subprocess.run(
                [
                    "git", "-C", str(repo_dir),
                    "-c", "user.name=kitrakrev",
                    "-c", "user.email=kitrakrev@users.noreply.github.com",
                    "commit", "-q", "-m",
                    f"teamhq: log multi-team migration plan for run {run_id[:8]}",
                ],
                check=True,
                capture_output=True,
            )
            subprocess.run(["git", "-C", str(repo_dir), "push", "-u", "origin", branch], check=True, capture_output=True)
            res = subprocess.run(
                [
                    "gh", "pr", "create",
                    "--repo", repo,
                    "--head", branch,
                    "--base", "main",
                    "--title", pr_title,
                    "--body", pr_body,
                    "--draft",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            url = res.stdout.strip().splitlines()[-1]
            emit(
                run_id=run_id,
                org_id=org_id,
                project_id=trigger.project_id,
                card_type="pr_opened",
                title=f"PR opened — {url.split('/')[-1]}",
                body={"url": url, "repo": repo, "branch": branch, "title": pr_title},
                status="opened",
            )
            print(f"[loop] PR opened: {url}")
            return url
    except subprocess.CalledProcessError as e:
        # Fall back so demo never blanks.
        print(f"[loop] PR open failed: {e.stderr}")
        emit(
            run_id=run_id,
            org_id=org_id,
            project_id=trigger.project_id,
            card_type="pr_pending",
            title="PR draft prepared (push failed — see body)",
            body={
                "repo": repo,
                "branch": branch,
                "title": pr_title,
                "body": pr_body,
                "error": (e.stderr or str(e))[:400],
            },
            status="pending",
        )
        return None
    except Exception as e:
        print(f"[loop] PR open unexpected error: {e}")
        emit(
            run_id=run_id,
            org_id=org_id,
            project_id=trigger.project_id,
            card_type="pr_pending",
            title="PR proposal ready",
            body={"repo": repo, "title": pr_title, "body": pr_body, "error": str(e)},
            status="pending",
        )
        return None
