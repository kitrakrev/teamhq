"""Spawned by /api/run-scenario — runs the agent loop for a real user run.

CLI (new shape):
    python scripts/run_scenario.py \
        --repo  <owner/name> \
        --prompt "<free text describing the change>" \
        --org   <org_uuid> \
        --project <project_uuid> \
        --run   <run_uuid>

The run row is already inserted by the API; we attach to it via env so
agent.loop can update it instead of inserting a duplicate.

Backwards-compat: if called with positional args (legacy scenario name),
fall back to the canned SCENARIOS map in agent/__main__.py so older
trigger paths keep working.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def _load_env() -> None:
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


def _infer_paths(repo: str, prompt: str) -> list[str]:
    """Best-effort affected_paths inference w/o a sandbox.

    1. Pull the repo's top-level tree via gh CLI (cheap, public-repo friendly).
    2. Match common stack hints in the prompt to plausible folders.
    3. If nothing matches, return the repo root so the agent at least sees
       a non-empty list (codeowners default mapping handles the rest).
    """
    import json
    import subprocess

    try:
        out = subprocess.run(
            ["gh", "api", f"repos/{repo}/contents/", "-q", '.[].path'],
            check=True, capture_output=True, text=True, timeout=20,
        )
        tree = [p.strip() for p in out.stdout.splitlines() if p.strip()]
    except Exception as e:
        print(f"[run_scenario] gh repo tree failed: {e}; using fallback paths")
        tree = []

    p = prompt.lower()
    hints: list[tuple[list[str], list[str]]] = [
        # (keywords, candidate paths inside the repo)
        (["api", "fastapi", "endpoint"], ["src/api", "api", "server"]),
        (["ml", "model", "inference", "embedding"], ["src/ml", "ml", "inference"]),
        (["frontend", "ui", "react", "next.js", "tsx"], ["frontend", "web", "client"]),
        (["docker", "deploy", "infra", "k8s", "kubernetes"], ["src/infra", "infra", "deploy", "ops"]),
        (["openai", "llm", "client"], ["src/llm_client.py", "src", "src/clients"]),
    ]
    matched: list[str] = []
    for keywords, candidates in hints:
        if any(k in p for k in keywords):
            for c in candidates:
                if not tree or c.split("/")[0] in tree or any(t.startswith(c.split("/")[0]) for t in tree):
                    matched.append(c)
    if not matched:
        # No keyword hits. Pick any code-shaped top-level dir.
        for t in tree:
            if t in ("src", "app", "lib", "frontend", "backend"):
                matched.append(t)
        if not matched:
            matched = ["."]
    # Dedupe preserving order.
    seen: set[str] = set()
    return [x for x in matched if not (x in seen or seen.add(x))]


def main(argv: list[str]) -> int:
    _load_env()

    # New flag-based shape.
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--repo")
    parser.add_argument("--prompt")
    parser.add_argument("--org")
    parser.add_argument("--project")
    parser.add_argument("--run")
    ns, rest = parser.parse_known_args(argv[1:])

    if ns.repo and ns.prompt and ns.org:
        from agent.loop import TriggerSpec, run as run_loop
        affected = _infer_paths(ns.repo, ns.prompt)
        print(f"[run_scenario] repo={ns.repo} prompt={ns.prompt!r} affected={affected}")
        trigger = TriggerSpec(
            repo=ns.repo,
            trigger_type="prompt",
            trigger_source=ns.prompt,
            affected_paths=affected,
            org_id=ns.org,
            project_id=ns.project,
        )
        # Demo runs from UI don't block on quorum so cards stream in.
        os.environ.setdefault("TEAMHQ_BLOCK_UNTIL_APPROVED", "0")
        # Tell the loop to attach to the run id the API already inserted
        # rather than inserting another row.
        if ns.run:
            os.environ["TEAMHQ_ATTACH_RUN_ID"] = ns.run
        final = run_loop(trigger)
        print(f"[run_scenario] done: {final.get('id')}")
        return 0

    # Legacy positional path (backwards compat).
    if len(rest) >= 2:
        from agent.__main__ import SCENARIOS
        from agent.loop import TriggerSpec, run as run_loop
        scenario_key, org_id = rest[0], rest[1]
        project_id = rest[2] if len(rest) > 2 else None
        base = SCENARIOS.get(scenario_key)
        if not base:
            print(f"unknown scenario: {scenario_key}", file=sys.stderr)
            return 2
        trigger = TriggerSpec(
            repo=base.repo,
            trigger_type=base.trigger_type,
            trigger_source=base.trigger_source,
            affected_paths=list(base.affected_paths),
            org_id=org_id,
            project_id=project_id,
        )
        os.environ.setdefault("TEAMHQ_BLOCK_UNTIL_APPROVED", "0")
        final = run_loop(trigger)
        print(f"[run_scenario] done: {final.get('id')}")
        return 0

    print("usage: run_scenario.py --repo <r> --prompt <p> --org <o> [--project <p>] [--run <r>]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
