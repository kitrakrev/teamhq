"""Tensorlake sandbox helpers: clone, run commands, capture output.

Each agent run gets a fresh ephemeral sandbox (V1). V2 will switch to a
named, suspendable sandbox per (repo, team) so FS state persists across runs
— that's our Track 1 statefulness flex even though we're submitting to
Track 4.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CmdResult:
    stdout: str
    stderr: str
    exit_code: int


def create() -> Any:
    """Provision a Tensorlake sandbox. Lazy-import so module load doesn't hit
    the network."""
    from tensorlake.sandbox import Sandbox

    return Sandbox.create()


def run(sb, program: str, args: list[str]) -> CmdResult:
    r = sb.run(program, args)
    return CmdResult(
        stdout=getattr(r, "stdout", "") or "",
        stderr=getattr(r, "stderr", "") or "",
        exit_code=getattr(r, "exit_code", getattr(r, "returncode", 0)),
    )


def clone(sb, repo: str, dest: str = "/work") -> CmdResult:
    """Clone a public GitHub repo into the sandbox FS at `dest`.

    Public-only for V1. V2 will pass a GitHub PAT for private repos.
    """
    return run(sb, "git", ["clone", "--depth", "1", f"https://github.com/{repo}.git", dest])
