"""LLM gateway via InsForge `/api/ai/chat/completion`.

Six models available out of the box:
  anthropic/claude-sonnet-4.5
  openai/gpt-4o-mini
  google/gemini-3-pro-image-preview
  deepseek/deepseek-v3.2
  x-ai/grok-4.1-fast
  minimax/minimax-m2.1

Default = openai/gpt-4o-mini (cheap, smart enough for classification + plan
synthesis steps that aren't Q&A-shaped — those still go through Hyperspell
answer=True for citation grounding).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


DEFAULT_MODEL = "openai/gpt-4o-mini"


def chat(
    *,
    messages: list[dict[str, str]],
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
    max_tokens: int = 800,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Single non-streaming chat call. Returns {text, metadata}."""
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "maxTokens": max_tokens,
        "temperature": temperature,
    }
    if system_prompt:
        body["systemPrompt"] = system_prompt

    url = os.environ["INSFORGE_PROJECT_URL"] + "/api/ai/chat/completion"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": os.environ["INSFORGE_ACCESS_API_KEY"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"insforge ai {e.code}: {e.read().decode()[:500]}") from e


def ask(prompt: str, *, model: str = DEFAULT_MODEL, system_prompt: str | None = None) -> str:
    """Single-turn convenience: returns the assistant's text only."""
    r = chat(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        system_prompt=system_prompt,
    )
    return r.get("text", "")
