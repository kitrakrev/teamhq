"""Per-role planning questions.

Before the agent commits to a plan, it asks each affected team's lead a few
structured questions, grounded in that user's actual history (Slack threads,
GitHub PRs, Notion ADRs they own). The questions block plan synthesis until
the lead answers — preventing the agent from picking a path the team has
already vetoed.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import hyperspell, llm
from .personas import PERSONAS


@dataclass
class Question:
    to_role: str            # 'lead' | 'architect' | 'pm' | ...
    to_team: str            # 'backend' | 'ds' | 'ui' | 'devops' | '*'
    to_user_email: str | None
    to_user_name: str | None
    text: str               # the question itself
    options: list[str]      # 2-3 structured options the user can click
    free_text_ok: bool      # accept free text in addition
    rationale: str          # why this question — what we found in their history
    citations: list[dict]   # [{kind, title, url}] from Hyperspell


def _user_history(user_email: str, user_name: str, team: str, topic: str) -> dict[str, Any]:
    """Pull this user's recent Slack/GitHub/Notion artifacts relevant to topic."""
    q = f"{user_name} {user_email} on {topic}"
    res = hyperspell.ask(team=team, question=q, max_results=5)
    return res


def _draft_question(
    *, role: str, team: str, user: str, topic: str, history: dict[str, Any], lead_email: str
) -> Question | None:
    """Use the LLM to draft one targeted question grounded in history."""
    docs = history.get("documents", [])
    if not docs:
        # No history — skip; agent will use generic plan instead.
        return None

    cite_text = "\n".join(
        f"- [{d.get('kind','doc')}] {d.get('title','')}: {(d.get('text') or '')[:200]}"
        for d in docs[:5]
    )

    sys_prompt = (
        "You output ONLY a single JSON object. No prose, no fences, no markdown. "
        "The object has exactly four keys: "
        '"text" (string, the question to ask), '
        '"options" (array of 2-3 short strings: candidate answers), '
        '"free_text_ok" (boolean), '
        '"rationale" (string, why this question references the history). '
        "Do not include any other keys."
    )

    user_prompt = (
        f"Draft a clarifying question that the team lead must answer before "
        f"a code agent can ship a change.\n\n"
        f"TOPIC: {topic}\n"
        f"TEAM: {team}\n"
        f"LEAD: {user}\n\n"
        f"LEAD'S HISTORY:\n{cite_text}\n\n"
        "Reference one artifact from history. Output ONLY the JSON object."
    )

    # Use Claude Sonnet — gpt-4o-mini ignores the schema spec.
    try:
        text = llm.chat(
            messages=[{"role": "user", "content": user_prompt}],
            system_prompt=sys_prompt,
            model="anthropic/claude-sonnet-4.5",
            max_tokens=400,
            temperature=0.1,
        ).get("text", "")
    except Exception:
        return None
    import json, re
    # Strip code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    # Extract any JSON-shaped blob — accept multiline.
    parsed: dict | None = None
    candidates = re.findall(r"\{[\s\S]*\}", text)
    for cand in candidates + [text]:
        try:
            d = json.loads(cand)
            if isinstance(d, dict):
                parsed = d
                break
        except json.JSONDecodeError:
            continue
    if not parsed:
        return None
    # Some models return {"question": ...} instead of {"text": ...} — accept both
    q_text = parsed.get("text") or parsed.get("question") or ""
    if not q_text:
        return None
    parsed = {
        "text": q_text,
        "options": parsed.get("options") or ["Yes", "No", "Discuss in thread"],
        "free_text_ok": bool(parsed.get("free_text_ok", True)),
        "rationale": parsed.get("rationale") or "Grounded in your prior decisions on this topic.",
    }

    return Question(
        to_role=role,
        to_team=team,
        to_user_email=lead_email,
        to_user_name=user,
        text=parsed.get("text", ""),
        options=parsed.get("options", [])[:4],
        free_text_ok=bool(parsed.get("free_text_ok", True)),
        rationale=parsed.get("rationale", ""),
        citations=[
            {"kind": d.get("kind"), "title": d.get("title"), "url": d.get("url")}
            for d in docs[:3]
        ],
    )


def fan_out(*, trigger_topic: str, teams: list[str]) -> list[Question]:
    """Generate one question per affected team (addressed to the team lead)."""
    out: list[Question] = []
    for team in teams:
        # Find the lead persona for this team.
        lead = next((p for p in PERSONAS.values() if p.team == team and p.role == "lead"), None)
        if lead is None:
            continue
        history = _user_history(lead.email, lead.name, team, trigger_topic)
        q = _draft_question(
            role=lead.role,
            team=team,
            user=lead.name,
            topic=trigger_topic,
            history=history,
            lead_email=lead.email,
        )
        if q:
            out.append(q)
    return out
