"""Path → team mapping for triggers. Pure-Python, no network."""
from __future__ import annotations

from agent.loop import teams_for_paths


def test_all_four_teams_route():
    paths = [
        "src/api/main.py",
        "src/ml/inference_client.py",
        "src/infra/Dockerfile",
        "frontend/src/api-client.ts",
    ]
    out = teams_for_paths(paths)
    assert set(out.keys()) == {"backend", "ds", "devops", "ui"}
    assert all(len(files) == 1 for files in out.values())


def test_unmatched_paths_drop():
    out = teams_for_paths(["docs/changelog.md", "src/api/main.py"])
    assert "backend" in out
    assert sum(len(v) for v in out.values()) == 1


def test_legacy_src_routes_to_backend():
    """Hero repo's V1 layout had src/llm_client.py (no /api prefix)."""
    out = teams_for_paths(["src/llm_client.py", "src/retry_wrapper.py"])
    assert out == {"backend": ["src/llm_client.py", "src/retry_wrapper.py"]}
