"""CLI entrypoint for one-shot V1 demo runs.

Usage:
    python -m agent  openai-bump        # canned trigger: openai==0.28 → 1.0
    python -m agent  fastapi-go         # canned trigger: FastAPI → Go (V3 demo)
"""
from __future__ import annotations

import json
import sys

from .loop import TriggerSpec, run


SCENARIOS: dict[str, TriggerSpec] = {
    "openai-bump": TriggerSpec(
        repo="kitrakrev/teamhq-hero",
        trigger_type="manual",
        trigger_source="openai==1.0.0 released — bump from 0.28",
        affected_paths=[
            "src/llm_client.py",       # backend
            "src/retry_wrapper.py",    # backend
            # V1 hero is single-team; V3 hero will add ml/ + frontend/ paths
        ],
    ),
    "fastapi-go": TriggerSpec(
        repo="kitrakrev/teamhq-hero",
        trigger_type="manual",
        trigger_source="Proposal: port FastAPI service to Go for cost/perf",
        affected_paths=[
            "src/api/main.py",         # backend
            "src/ml/inference_client.py",  # ds
            "src/infra/Dockerfile",    # devops
            "frontend/src/api-client.ts",  # ui
        ],
    ),
}


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in SCENARIOS:
        print("usage: python -m agent <scenario>", file=sys.stderr)
        print(f"scenarios: {', '.join(SCENARIOS)}", file=sys.stderr)
        return 2
    trigger = SCENARIOS[argv[1]]
    final = run(trigger)
    print()
    print("=== final run row ===")
    print(json.dumps(final, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
