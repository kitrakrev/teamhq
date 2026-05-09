"""Pluggable executor — applies a plan and opens a PR.

V1: GitHubAPIExecutor (REST).
V2: DevinExecutor (when Devin email arrives).

Each executor takes a plan + repo + diff, returns the resulting PR URL.
"""
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass


@dataclass
class PROpened:
    url: str
    number: int


def _gh(args: list[str]) -> str:
    """Call gh CLI (already authed as kitrakrev). Returns stdout."""
    res = subprocess.run(["gh", *args], capture_output=True, text=True, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} -> {res.returncode}: {res.stderr}")
    return res.stdout


def open_pr(*, repo: str, branch: str, title: str, body: str, base: str = "main") -> PROpened:
    """Open a PR on `repo` (owner/name) from `branch` -> `base`.

    Branch must already exist on origin (we pushed it via the sandbox).
    """
    out = _gh(
        [
            "pr",
            "create",
            "--repo", repo,
            "--base", base,
            "--head", branch,
            "--title", title,
            "--body", body,
            "--draft",
        ]
    )
    url = out.strip().splitlines()[-1]
    number = int(url.rsplit("/", 1)[-1])
    return PROpened(url=url, number=number)
