"""Spawned by /api/run-scenario to execute a scenario in the background.

Usage:
    python scripts/run_scenario.py <scenario> <org_id> [project_id]

Loads .env, picks the scenario's TriggerSpec template from agent.__main__, then
overrides org_id/project_id so the run lands in the right tenant + project.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def _load_env() -> None:
    """Tiny .env loader so the spawned process inherits API keys without
    requiring python-dotenv. Only sets vars that aren't already in env."""
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: run_scenario.py <scenario> <org_id> [project_id]", file=sys.stderr)
        return 2

    _load_env()

    from agent.__main__ import SCENARIOS
    from agent.loop import TriggerSpec, run

    scenario_key = argv[1]
    org_id = argv[2]
    project_id = argv[3] if len(argv) > 3 else None

    base = SCENARIOS.get(scenario_key)
    if not base:
        print(f"unknown scenario: {scenario_key}; have {list(SCENARIOS)}", file=sys.stderr)
        return 2

    trigger = TriggerSpec(
        repo=base.repo,
        trigger_type=base.trigger_type,
        trigger_source=base.trigger_source,
        affected_paths=list(base.affected_paths),
        org_id=org_id,
        project_id=project_id,
    )
    # Demo runs spawned from UI should NOT block on quorum so cards stream in.
    # Production / CLI runs default to blocking.
    os.environ.setdefault("TEAMHQ_BLOCK_UNTIL_APPROVED", "0")
    final = run(trigger)
    print(f"[run_scenario] done: {final.get('id')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
