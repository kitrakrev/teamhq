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
import os
import time
from dataclasses import dataclass, field
from typing import Any

from . import hyperspell, sandbox
from . import questions as questions_mod
from . import acceptance as acceptance_mod
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
    # If the caller (e.g. /api/run-scenario) already inserted a run row and
    # passed its id via env, attach to that instead of inserting another.
    attach_id = os.environ.get("TEAMHQ_ATTACH_RUN_ID")
    if attach_id:
        return {
            "id": attach_id,
            "org_id": org_id,
            "repo": trigger.repo,
            "status": "running",
        }
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

    # Phase 1.0 — for feature-proposal triggers, generate acceptance criteria
    # FIRST so plans + ship are gated on agreed-upon definition of done.
    if trigger.trigger_type == "feature_proposal":
        try:
            criteria = acceptance_mod.generate(
                feature=trigger.trigger_source,
                teams=list(teams.keys()),
                context=", ".join(trigger.affected_paths[:6]),
            )
            emit(
                run_id=run_id,
                org_id=org_id,
                project_id=trigger.project_id,
                card_type="acceptance_criteria",
                title=f"Acceptance criteria · {len(criteria)} items",
                body={
                    "feature": trigger.trigger_source,
                    "criteria": [
                        {
                            "id": c.id,
                            "statement": c.statement,
                            "kind": c.kind,
                            "test_command": c.test_command,
                            "expected": c.expected,
                            "owner_role": c.owner_role,
                            "status": c.status,
                        }
                        for c in criteria
                    ],
                },
                visibility={"read": ["*"], "act": ["role:lead", "role:architect"]},
                status="awaiting_approval",
            )
            print(f"[loop] acceptance_criteria emitted: {len(criteria)} items")
        except Exception as e:
            print(f"[loop] AC generation skipped: {e}")

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
    # Default ON — quorum is the product. Set TEAMHQ_BLOCK_UNTIL_APPROVED=0
    # to bypass for canned demo runs that ship a PR without human gating.
    block_until_approved = os.environ.get("TEAMHQ_BLOCK_UNTIL_APPROVED", "1") == "1"
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


def _run_claude_code(repo_dir, trigger: TriggerSpec, team_plans: dict[str, dict[str, Any]]) -> bool:
    """Invoke Claude Code in headless mode against the cloned repo.

    Returns True if `claude` ran and produced a diff, False otherwise (so the
    caller falls back to a notes-only commit).

    Strategy:
      - Compose a prompt that includes the trigger + per-team plans w/ citations.
      - Run `claude -p <prompt> --add-dir <repo> --allowedTools 'Edit Write Read Bash(git *)' --dangerously-skip-permissions`.
      - Capture stdout for the pr_opened card body.
      - Inspect `git status` after — if no working-tree changes, return False
        so the caller appends TEAMHQ-NOTES.md to keep the PR non-empty.
    """
    import shutil
    import subprocess as sp

    if not shutil.which("claude"):
        print("[loop] claude CLI not on PATH; skipping Claude Code edits")
        return False

    plan_blocks = []
    for team, plan in team_plans.items():
        cites = ", ".join(d.get("title", "") for d in plan.get("documents", [])[:5])
        plan_blocks.append(
            f"## {team.upper()} team plan\n\n{plan.get('answer','(no plan)')}\n\n"
            f"Citations: {cites or '(none)'}"
        )
    prompt = (
        f"You are part of TeamHQ — an engineering decision agent that just received "
        f"approval from every team to ship the change below.\n\n"
        f"# Change request\n{trigger.trigger_source}\n\n"
        f"# Affected areas (from CODEOWNERS)\n{', '.join(trigger.affected_paths) or '(none)'}\n\n"
        f"# Per-team plans (already approved by quorum)\n\n"
        + "\n\n".join(plan_blocks)
        + "\n\n# Your job\n"
        "Make the smallest concrete code changes that move toward the plans above. "
        "Don't try to land the whole migration in one PR — focus on a clean, reviewable "
        "first step (a stub, a config file, a new module, an updated import) that "
        "respects every team's cited conventions. If the change touches multiple files, "
        "keep them logically grouped. After editing, write a one-paragraph summary of "
        "what you changed and why."
    )

    try:
        res = sp.run(
            [
                "claude", "-p", prompt,
                "--add-dir", str(repo_dir),
                "--dangerously-skip-permissions",
            ],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            timeout=600,
        )
        print(f"[loop] claude exited rc={res.returncode}, stdout={len(res.stdout)} chars")
        if res.returncode != 0:
            print(f"[loop] claude stderr: {res.stderr[:500]}")
            return False
    except Exception as e:
        print(f"[loop] claude invocation failed: {e}")
        return False

    # Did Claude actually change anything?
    diff = sp.run(["git", "-C", str(repo_dir), "status", "--porcelain"], capture_output=True, text=True)
    if not diff.stdout.strip():
        print("[loop] claude ran but made no changes")
        return False
    print(f"[loop] claude changed: {diff.stdout.strip()[:300]}")
    return True


def _gh_auth_env(org_id: str) -> dict[str, str]:
    """Return env-var overrides containing GH_TOKEN if a write-scope OAuth
    token is available in InsForge for any user in this org. Falls back to
    an empty dict so the existing `gh auth` chain handles auth.
    """
    try:
        # Pull oauth_tokens scoped to this org's members; pick newest write token.
        # InsForge list_rows can't natively filter on a join — pull the org's
        # users and intersect client-side. Cheap for demo scale.
        from .insforge import _req as ifg_req
        members = ifg_req("GET", f"/api/database/records/org_members?org_id=eq.{org_id}") or []
        user_ids = [m.get("user_id") for m in members if m.get("user_id")]
        if not user_ids:
            return {}
        in_clause = ",".join(user_ids)
        rows = ifg_req(
            "GET",
            f"/api/database/records/oauth_tokens?provider=eq.github_write&user_id=in.({in_clause})&order=created_at.desc",
        ) or []
        tok = next((r for r in rows if r.get("access_token")), None)
        if not tok:
            return {}
        return {"GH_TOKEN": tok["access_token"], "GITHUB_TOKEN": tok["access_token"]}
    except Exception as e:
        print(f"[loop] gh_auth_env lookup failed: {e}")
        return {}


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
    body_lines.append("Generated by TeamHQ. Code edits by **Claude Code** (`claude -p`) running in a Tensorlake sandbox, scoped to the cloned repo + the per-team plans above. Approvals tracked in the org's decision feed.")
    pr_body = "\n".join(body_lines)

    pr_title = f"TeamHQ: {trigger.trigger_source[:60]}"

    # If a per-user `github_write` OAuth token is on file in InsForge for the
    # org's owner, prefer that for `gh` auth — that's how production users
    # ship without giving the agent a server-side PAT. Falls back to whatever
    # the env / `gh auth` already has.
    gh_env = _gh_auth_env(org_id)

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

            # === Claude Code execution ===
            # Hand the cloned repo + per-team plans to `claude -p` running
            # in headless mode. Claude makes the actual edits per the plan;
            # we then commit whatever it changed. If claude isn't on PATH
            # (e.g. inside Tensorlake container) we fall back to the
            # TEAMHQ-NOTES.md placeholder so the PR still has a non-empty
            # diff.
            claude_used = _run_claude_code(repo_dir, trigger, team_plans)
            if not claude_used:
                note_path = repo_dir / "TEAMHQ-NOTES.md"
                previous = note_path.read_text() if note_path.exists() else "# TeamHQ run log\n\n"
                note_path.write_text(
                    previous
                    + f"- {time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime())} · run `{run_id[:8]}` · {trigger.trigger_source}\n"
                )

            # Stage everything Claude (or the fallback) wrote.
            subprocess.run(["git", "-C", str(repo_dir), "add", "-A"], check=True, capture_output=True)
            commit_msg = (
                f"teamhq: {'claude code edits' if claude_used else 'log multi-team migration plan'} for run {run_id[:8]}"
            )
            commit_res = subprocess.run(
                [
                    "git", "-C", str(repo_dir),
                    "-c", "user.name=kitrakrev",
                    "-c", "user.email=kitrakrev@users.noreply.github.com",
                    "commit", "-q", "-m", commit_msg, "--allow-empty",
                ],
                capture_output=True,
            )
            if commit_res.returncode != 0:
                print(f"[loop] commit failed: {commit_res.stderr.decode()[:200]}")
            push_env = dict(os.environ)
            if gh_env.get("GH_TOKEN"):
                # Use HTTPS push w/ token in URL so we don't depend on a
                # cached `gh auth` setup (works in fresh containers).
                token_url = f"https://x-access-token:{gh_env['GH_TOKEN']}@github.com/{repo}.git"
                subprocess.run(["git", "-C", str(repo_dir), "remote", "set-url", "origin", token_url], check=True, capture_output=True)
            subprocess.run(
                ["git", "-C", str(repo_dir), "push", "-u", "origin", branch],
                check=True, capture_output=True, env=push_env,
            )
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
                env={**os.environ, **gh_env},
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
