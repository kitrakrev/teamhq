"""Single source of truth for demo personas.

Every other module imports persona facts from here. NEVER hardcode a name,
team, role, or github_login elsewhere — change it here and propagate.

V1 demo uses 4 team leads. V3 introduces ARCHITECT (Dan). V4 introduces PM (Frank).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Persona:
    name: str           # display name in cards
    email: str          # InsForge users.email key
    role: str           # 'lead' | 'architect' | 'pm' | 'member' | 'viewer'
    team: str           # 'backend' | 'ds' | 'ui' | 'devops' | '*'
    github_login: str   # real GH handle (used in CODEOWNERS + PR attribution)
    slack_avatar: str   # Slack icon_emoji for chat:write.customize messages


PERSONAS: dict[str, Persona] = {
    "sarah": Persona(
        name="Sarah Chen",
        email="sarah@teamhq.demo",
        role="lead",
        team="backend",
        github_login="kitrakrev",
        slack_avatar=":woman_technologist:",
    ),
    "iris": Persona(
        name="Iris Patel",
        email="iris@teamhq.demo",
        role="lead",
        team="ds",
        github_login="kart-001",
        slack_avatar=":woman_scientist:",
    ),
    "alice": Persona(
        name="Alice Rivera",
        email="alice@teamhq.demo",
        role="lead",
        team="ui",
        github_login="Ash-ketchum-pikachu",
        slack_avatar=":artist:",
    ),
    "grace": Persona(
        name="Grace Liu",
        email="grace@teamhq.demo",
        role="lead",
        team="devops",
        github_login="kitrakrev",   # doubles up for V1 (PRs all open via kitrakrev)
        slack_avatar=":construction_worker:",
    ),
    "dan": Persona(  # V3 only — architect, breaks deadlocks
        name="Dan Park",
        email="dan@teamhq.demo",
        role="architect",
        team="*",
        github_login="kitrakrev",
        slack_avatar=":man_with_turban:",
    ),
    "frank": Persona(  # V4 only — PM, proposes features
        name="Frank Lee",
        email="frank@teamhq.demo",
        role="pm",
        team="*",
        github_login="kitrakrev",
        slack_avatar=":briefcase:",
    ),
}


# Convenience indexes
def by_team(team: str) -> list[Persona]:
    return [p for p in PERSONAS.values() if p.team == team and p.role == "lead"]


def architect() -> Persona:
    return PERSONAS["dan"]


def role_rank(role: str) -> int:
    """Higher number = more authority."""
    return {
        "viewer": 0,
        "member": 1,
        "lead": 2,
        "architect": 3,
        "org_owner": 4,
        "pm": 1,  # PMs propose; can reject scope but not override eng decisions
    }.get(role, 0)


def can_override(actor: Persona, decider: Persona) -> bool:
    """True if actor's role outranks decider's role."""
    return role_rank(actor.role) > role_rank(decider.role)


def slack_post_kwargs(persona: Persona) -> dict:
    """Returns {username, icon_emoji} for chat.postMessage to render as persona."""
    return {"username": persona.name, "icon_emoji": persona.slack_avatar}
