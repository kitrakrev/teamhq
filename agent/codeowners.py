"""Parse a CODEOWNERS file -> path-glob -> [owner usernames].

CODEOWNERS syntax (subset we use): one rule per line, leading path-glob,
trailing list of @user / @team mentions. We don't honor Git's full glob
spec; for hackathon we treat lines as `prefix\towners` and pattern-match by
prefix.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Owner:
    pattern: str            # "/src/api/" -> matches files under it
    owners: list[str]       # ["@kitrakrev"]


def parse(text: str) -> list[Owner]:
    out: list[Owner] = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        pattern, *owners = parts
        out.append(Owner(pattern=pattern, owners=owners))
    return out


def owners_for(rules: list[Owner], file_path: str) -> list[str]:
    """Last matching rule wins (CODEOWNERS spec)."""
    match: list[str] = []
    for rule in rules:
        if _matches(rule.pattern, file_path):
            match = rule.owners
    return match


def _matches(pattern: str, path: str) -> bool:
    if pattern == "*":
        return True
    if pattern.startswith("/"):
        return path.startswith(pattern.lstrip("/"))
    if pattern.endswith("/"):
        return ("/" + pattern) in ("/" + path + "/")
    return path == pattern or path.endswith("/" + pattern)
