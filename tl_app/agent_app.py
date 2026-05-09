"""TeamHQ agent — deployed as a Tensorlake Application.

Triggered via:
    POST https://api.tensorlake.ai/applications/run_teamhq_scenario
    body: {"scenario": "fastapi-go" | "openai-bump" | "react-nextjs",
           "org_id": "<uuid>", "project_id": "<uuid?>"}

The function reuses the existing `agent/loop.py` orchestration. Tensorlake
provides a managed runtime — `git`, `gh`, network egress are all available so
the real PR opener works (unlike a flaky venue network).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Make the agent package importable. The deployed bundle includes /agent.
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent))

from tensorlake.applications import application, function, Image  # noqa: E402

# Custom image: install Python deps + bundle the local `agent/` package.
# Tensorlake builds this once; subsequent invocations reuse the layer.
agent_image = (
    Image()
    .run(
        "pip install --no-cache-dir "
        "hyperspell==0.37.0 "
        "tensorlake "
        "requests"
    )
    # `tl deploy` uploads the project root as the build context; the agent/
    # package lives at /agent in our repo — copy it into the container so
    # `from agent.loop import run` works at runtime.
    .copy("agent", "/app/agent")
    .env("PYTHONPATH", "/app")
)

from agent.loop import TriggerSpec, run as run_loop  # noqa: E402


SCENARIOS: dict[str, TriggerSpec] = {
    "openai-bump": TriggerSpec(
        repo="kitrakrev/teamhq-hero",
        trigger_type="ui",
        trigger_source="openai==1.0.0 released — bump from 0.28",
        affected_paths=["src/llm_client.py", "src/retry_wrapper.py"],
    ),
    "fastapi-go": TriggerSpec(
        repo="kitrakrev/teamhq-hero",
        trigger_type="ui",
        trigger_source="Proposal: port FastAPI service to Go for cost/perf",
        affected_paths=[
            "src/api/main.py",
            "src/ml/inference_client.py",
            "src/infra/Dockerfile",
            "frontend/src/api-client.ts",
        ],
    ),
    "react-nextjs": TriggerSpec(
        repo="kitrakrev/teamhq-hero",
        trigger_type="ui",
        trigger_source="Proposal: migrate React CRA to Next.js App Router",
        affected_paths=[
            "frontend/package.json",
            "frontend/src/App.tsx",
            "frontend/src/api-client.ts",
            "src/infra/Dockerfile",
        ],
    ),
}


@application()
@function(
    image=agent_image,
    secrets=[
        "HYPERSPELL_API_KEY",
        "NIA_API_KEY",
        "INSFORGE_PROJECT_URL",
        "INSFORGE_ACCESS_API_KEY",
        "ORG_ID",
    ],
)
def run_teamhq_scenario(scenario: str, org_id: str | None = None, project_id: str | None = None) -> dict:
    """Execute one TeamHQ scenario end-to-end. Returns the final run row."""
    if scenario not in SCENARIOS:
        return {"error": f"unknown scenario: {scenario}"}

    base = SCENARIOS[scenario]
    trigger = TriggerSpec(
        repo=base.repo,
        trigger_type=base.trigger_type,
        trigger_source=base.trigger_source,
        affected_paths=list(base.affected_paths),
        org_id=org_id,
        project_id=project_id,
    )
    final = run_loop(trigger)
    return {
        "ok": True,
        "run_id": final.get("id"),
        "status": final.get("status"),
        "pr_url": final.get("pr_url") or None,
    }


if __name__ == "__main__":
    # Local test — same call shape as Tensorlake invocation.
    from tensorlake.applications import run_local_application

    out = run_local_application(run_teamhq_scenario, "fastapi-go", os.environ.get("ORG_ID"), None)
    print(out.output())
