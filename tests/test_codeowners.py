"""CODEOWNERS parser tests."""
from __future__ import annotations

from agent.codeowners import owners_for, parse


# Real-world GitHub CODEOWNERS convention: wildcard first as a fallback,
# specific paths override. (Last-match-wins, per spec.)
SAMPLE = """\
# comment
*           @kitrakrev
/src/api/   @kitrakrev
/src/ml/    @kart-001
/frontend/  @Ash-ketchum-pikachu
"""


def test_parse_skips_comments_and_blanks():
    rules = parse(SAMPLE)
    patterns = [r.pattern for r in rules]
    assert patterns == ["*", "/src/api/", "/src/ml/", "/frontend/"]


def test_owner_lookup_specific_path():
    rules = parse(SAMPLE)
    # /src/ml/ overrides * since it's matched after the wildcard.
    assert owners_for(rules, "src/ml/inference.py") == ["@kart-001"]
    assert owners_for(rules, "frontend/src/api-client.ts") == ["@Ash-ketchum-pikachu"]


def test_glob_falls_back_to_wildcard():
    rules = parse(SAMPLE)
    # No specific rule matches docs/ — wildcard wins by default.
    assert owners_for(rules, "README.md") == ["@kitrakrev"]


def test_last_matching_rule_wins_when_specific_after_wildcard():
    rules = parse(SAMPLE)
    # /src/api/ defined after *, so it wins for paths inside it.
    assert owners_for(rules, "src/api/auth.py") == ["@kitrakrev"]
