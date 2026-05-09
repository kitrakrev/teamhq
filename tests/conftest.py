"""Pytest fixtures shared across the agent test suite.

Loads .env once for the whole session so every test sees the same sponsor
keys + tenant config. Skips network-touching tests when keys are absent
(no flaky local CI).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Load .env once
env_file = ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def _have(*names: str) -> bool:
    return all(os.environ.get(n) for n in names)


# Capability gates — skip groups when their backend isn't reachable.
needs_insforge = pytest.mark.skipif(
    not _have("INSFORGE_PROJECT_URL", "INSFORGE_ACCESS_API_KEY"),
    reason="InsForge env not set",
)
needs_hyperspell = pytest.mark.skipif(
    not _have("HYPERSPELL_API_KEY"), reason="Hyperspell key missing"
)
needs_tensorlake = pytest.mark.skipif(
    not _have("TENSORLAKE_API_KEY"), reason="Tensorlake key missing"
)
needs_org_id = pytest.mark.skipif(
    not _have("ORG_ID"), reason="ORG_ID (multi-tenant scope) missing"
)


@pytest.fixture(scope="session")
def org_id() -> str:
    """The active tenant id used by V2.5+ tests."""
    return os.environ["ORG_ID"]


@pytest.fixture(scope="session")
def insforge_url() -> str:
    return os.environ["INSFORGE_PROJECT_URL"]


@pytest.fixture(scope="session")
def insforge_key() -> str:
    return os.environ["INSFORGE_ACCESS_API_KEY"]
