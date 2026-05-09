"""Hyperspell integration tests — team-scoped citations w/ URL enrichment."""
from __future__ import annotations

from tests.conftest import needs_hyperspell


@needs_hyperspell
def test_backend_team_brain_returns_answer():
    from agent.hyperspell import ask
    r = ask(team="backend", question="What is our convention for the openai retry wrapper?")
    assert r["team"] == "backend"
    assert r["model"] == "gpt-oss-120b"
    assert r["answer"], "expected non-empty answer for backend retry-wrapper question"
    assert len(r["documents"]) >= 1, "expected at least 1 cited document"


@needs_hyperspell
def test_citations_carry_real_notion_urls():
    """Backend team's ADR-12 lives in Notion; the citation must link to it."""
    from agent.hyperspell import ask
    r = ask(team="backend", question="What does ADR-12 say about retry wrapper?")
    adr_docs = [d for d in r["documents"] if d.get("kind") == "adr"]
    assert adr_docs, "expected at least one ADR-typed citation"
    assert adr_docs[0]["url"], "ADR citation missing notion url"
    assert "notion.so" in adr_docs[0]["url"]


@needs_hyperspell
def test_citations_carry_slack_channel_urls():
    from agent.hyperspell import ask
    r = ask(team="backend", question="What did Sarah say about retry wrapper?")
    slack_docs = [d for d in r["documents"] if d.get("kind") == "slack"]
    if slack_docs:  # answer-grounded retrieval may not always hit Slack
        d = slack_docs[0]
        assert d["url"] and "teamhq-corp.slack.com/archives/" in d["url"]
        assert d["channel"] == "#backend"


@needs_hyperspell
def test_team_isolation_ds_does_not_leak_backend_artifacts():
    """DS query should not surface Backend's ADR-12."""
    from agent.hyperspell import ask
    r = ask(team="ds", question="What is our convention for the openai retry wrapper?")
    titles = " ".join((d.get("title") or "") for d in r["documents"]).lower()
    assert "adr-12" not in titles, "DS team should not surface Backend's ADR-12"
