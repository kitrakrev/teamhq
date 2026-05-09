"""LLM gateway via InsForge `/api/ai/chat/completion`.

Models available (verified): anthropic/claude-sonnet-4.5, openai/gpt-4o-mini,
google/gemini-3-pro-image-preview, deepseek/deepseek-v3.2, x-ai/grok-4.1-fast,
minimax/minimax-m2.1.

Default = openai/gpt-4o-mini (fast, cheap, good for structured output).
Cost-free per the InsForge AI gateway billing on this project.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

DEFAULT_MODEL = "openai/gpt-4o-mini"


def _url() -> str:
    v = os.environ.get("INSFORGE_PROJECT_URL")
    if not v:
        raise RuntimeError("INSFORGE_PROJECT_URL missing")
    return v


def _key() -> str:
    v = os.environ.get("INSFORGE_ACCESS_API_KEY")
    if not v:
        raise RuntimeError("INSFORGE_ACCESS_API_KEY missing")
    return v


def chat(
    *,
    messages: list[dict],
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
    max_tokens: int = 800,
    temperature: float = 0.2,
) -> dict:
    body: dict = {
        "model": model,
        "messages": messages,
        "maxTokens": max_tokens,
        "temperature": temperature,
    }
    if system_prompt:
        body["systemPrompt"] = system_prompt

    req = urllib.request.Request(
        _url() + "/api/ai/chat/completion",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": _key(),
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
    r = chat(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        system_prompt=system_prompt,
    )
    return r.get("text", "")
