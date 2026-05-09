"""Tensorlake sandbox integration test."""
from __future__ import annotations

from tests.conftest import needs_tensorlake


@needs_tensorlake
def test_sandbox_runs_python_version():
    from agent import sandbox

    sb = sandbox.create()
    try:
        r = sandbox.run(sb, "python", ["--version"])
        out = (r.stdout or r.stderr).strip()
        assert "Python" in out
    finally:
        try:
            sb.terminate()
        except Exception:
            pass


@needs_tensorlake
def test_sandbox_runs_arbitrary_python_code():
    from agent import sandbox

    sb = sandbox.create()
    try:
        r = sandbox.run(sb, "python", ["-c", "print(2 + 3)"])
        assert r.stdout.strip() == "5"
        assert r.exit_code == 0
    finally:
        try:
            sb.terminate()
        except Exception:
            pass
